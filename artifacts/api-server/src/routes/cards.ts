import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, listingsTable } from "@workspace/db";
import { eq, desc, and, like, or, sql, count, inArray } from "drizzle-orm";
import {
  AnalyzeCardBody,
  BatchAnalyzeCardsBody,
  CreateCardBody,
  UpdateCardBody,
  ListCardsQueryParams,
  GetCardParams,
  UpdateCardParams,
  DeleteCardParams,
  GetCardPricingParams,
  GetBatchProgressParams,
} from "@workspace/api-zod";
import { analyzeCardImage } from "../lib/cardAnalysis";
import { fetchSuggestedPrice, EBAY_FVF_RATE, SHIPPING_COST } from "../lib/pricing";
import { fetchTcgImageUrl } from "../lib/pokemonPricing";
import { generateDescription, generateTitle } from "../lib/ebay";
import { randomUUID } from "crypto";

const router = Router();

// In-memory store for batch jobs
const batchJobs = new Map<
  string,
  {
    total: number;
    processed: number;
    results: number[];
    done: boolean;
    error?: string;
  }
>();

// GET /cards/stats
router.get("/cards/stats", async (req, res) => {
  try {
    const [totalResult] = await db
      .select({ count: count() })
      .from(cardsTable);

    const [pendingResult] = await db
      .select({ count: count() })
      .from(cardsTable)
      .where(eq(cardsTable.status, "pending"));

    const [reviewedResult] = await db
      .select({ count: count() })
      .from(cardsTable)
      .where(eq(cardsTable.status, "reviewed"));

    const [listedResult] = await db
      .select({ count: count() })
      .from(cardsTable)
      .where(eq(cardsTable.status, "listed"));

    const [standardResult] = await db
      .select({ count: count() })
      .from(cardsTable)
      .where(eq(cardsTable.holoType, "standard"));

    const [holoResult] = await db
      .select({ count: count() })
      .from(cardsTable)
      .where(eq(cardsTable.holoType, "holo"));

    const [reverseHoloResult] = await db
      .select({ count: count() })
      .from(cardsTable)
      .where(eq(cardsTable.holoType, "reverse_holo"));

    const [cosmoHoloResult] = await db
      .select({ count: count() })
      .from(cardsTable)
      .where(eq(cardsTable.holoType, "cosmo_holo"));

    const qualityRows = await db
      .select({ quality: cardsTable.quality, count: count() })
      .from(cardsTable)
      .groupBy(cardsTable.quality);

    const recentlyAdded = await db
      .select()
      .from(cardsTable)
      .orderBy(desc(cardsTable.createdAt))
      .limit(5);

    res.json({
      total: Number(totalResult?.count ?? 0),
      pending: Number(pendingResult?.count ?? 0),
      reviewed: Number(reviewedResult?.count ?? 0),
      listed: Number(listedResult?.count ?? 0),
      holoBreakdown: {
        standard: Number(standardResult?.count ?? 0),
        holo: Number(holoResult?.count ?? 0),
        reverse_holo: Number(reverseHoloResult?.count ?? 0),
        cosmo_holo: Number(cosmoHoloResult?.count ?? 0),
      },
      qualityBreakdown: qualityRows
        .filter((r) => r.quality != null)
        .map((r) => ({ quality: r.quality!, count: Number(r.count) })),
      recentlyAdded,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get card stats");
    res.status(500).json({ error: "Failed to get stats" });
  }
});

// POST /cards/analyze
router.post("/cards/analyze", async (req, res) => {
  const parsed = AnalyzeCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const analysis = await analyzeCardImage(parsed.data.imageBase64);

    const imageUrl = parsed.data.imageBase64.startsWith("data:")
      ? parsed.data.imageBase64
      : `data:image/jpeg;base64,${parsed.data.imageBase64}`;
    const imageBackUrl = parsed.data.imageBackBase64
      ? `data:image/jpeg;base64,${parsed.data.imageBackBase64}`
      : null;

    // Fetch pricing in parallel with DB insert
    const [insertResult, pricing] = await Promise.all([
      db
        .insert(cardsTable)
        .values({
          imageUrl,
          imageUrlBack: imageBackUrl,
          cardName: analysis.cardName,
          setName: analysis.setName,
          cardNumber: analysis.cardNumber,
          year: analysis.year,
          quality: analysis.quality,
          holoType: analysis.holoType,
          language: analysis.language,
          rarity: analysis.rarity,
          status: "pending",
        })
        .returning(),
      fetchSuggestedPrice(analysis),
    ]);
    const card = insertResult[0];

    // TCGPlayer is authoritative for set name and year — always prefer it over AI
    const setName = pricing.matchedSetName ?? analysis.setName ?? null;
    const year = pricing.matchedYear ?? analysis.year ?? null;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (pricing.suggestedPrice !== null) updates.suggestedPrice = pricing.suggestedPrice;
    if (setName) updates.setName = setName;
    if (year) updates.year = year;
    if (Object.keys(updates).length > 1) {
      await db.update(cardsTable).set(updates).where(eq(cardsTable.id, card.id));
    }

    res.json({
      cardId: card.id,
      cardName: analysis.cardName,
      setName,
      cardNumber: analysis.cardNumber,
      year: analysis.year,
      quality: analysis.quality,
      holoType: analysis.holoType,
      language: analysis.language,
      rarity: analysis.rarity,
      confidence: analysis.confidence,
      imageUrl,
      suggestedPrice: pricing.suggestedPrice,
      averagePrice: pricing.averagePrice,
      soldCount: pricing.soldCount,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to analyze card");
    res.status(500).json({ error: "Failed to analyze card" });
  }
});

// POST /cards/batch-analyze
router.post("/cards/batch-analyze", async (req, res) => {
  const parsed = BatchAnalyzeCardsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const jobId = randomUUID();
  const images = parsed.data.images;
  const total = images.length;

  batchJobs.set(jobId, {
    total,
    processed: 0,
    results: [],
    done: false,
  });

  // Process in background
  (async () => {
    const job = batchJobs.get(jobId)!;
    for (const img of images) {
      try {
        const analysis = await analyzeCardImage(img.imageBase64);
        const imageUrl = img.imageBase64.startsWith("data:")
          ? img.imageBase64
          : `data:image/jpeg;base64,${img.imageBase64}`;
        const imageBackUrl = img.imageBackBase64
          ? `data:image/jpeg;base64,${img.imageBackBase64}`
          : null;
        const [insertResult, pricing] = await Promise.all([
          db
            .insert(cardsTable)
            .values({
              cardName: analysis.cardName,
              setName: analysis.setName,
              cardNumber: analysis.cardNumber,
              year: analysis.year,
              quality: analysis.quality,
              holoType: analysis.holoType,
              language: analysis.language,
              rarity: analysis.rarity,
              status: "pending",
              imageUrl,
              imageUrlBack: imageBackUrl,
            })
            .returning(),
          fetchSuggestedPrice(analysis),
        ]);
        const card = insertResult[0];
        // TCGPlayer is authoritative for set name and year — always prefer it over AI
        const setName = pricing.matchedSetName ?? analysis.setName ?? null;
        const year = pricing.matchedYear ?? analysis.year ?? null;
        const updates: Record<string, unknown> = { updatedAt: new Date() };
        if (pricing.suggestedPrice !== null) updates.suggestedPrice = pricing.suggestedPrice;
        if (setName) updates.setName = setName;
        if (year) updates.year = year;
        if (pricing.tcgImageUrl) updates.tcgImageUrl = pricing.tcgImageUrl;
        if (Object.keys(updates).length > 1) {
          await db.update(cardsTable).set(updates).where(eq(cardsTable.id, card.id));
        }
        job.results.push(card.id);
      } catch (err) {
        console.error("[batch-analyze] Failed to process image:", err);
      }
      job.processed += 1;
    }
    job.done = true;
  })();

  res.json({ jobId, total });
});

// GET /cards/batch-analyze/:jobId/progress
router.get("/cards/batch-analyze/:jobId/progress", (req, res) => {
  const parsed = GetBatchProgressParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const { jobId } = parsed.data;
  const job = batchJobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    processed: job.processed,
    total: job.total,
    done: job.done,
    cardIds: job.done ? job.results : undefined,
  });
});

// GET /cards
router.get("/cards", async (req, res) => {
  const parsed = ListCardsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  const { status, holoType, search } = parsed.data;

  try {
    const conditions = [];
    if (status) conditions.push(eq(cardsTable.status, status as "pending" | "reviewed" | "listed"));
    if (holoType) conditions.push(eq(cardsTable.holoType, holoType as "standard" | "holo" | "reverse_holo" | "cosmo_holo"));
    if (search) {
      conditions.push(
        or(
          like(cardsTable.cardName, `%${search}%`),
          like(cardsTable.setName, `%${search}%`),
        ),
      );
    }

    const cards = await db
      .select()
      .from(cardsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(cardsTable.createdAt));

    res.json(cards);
  } catch (err) {
    req.log.error({ err }, "Failed to list cards");
    res.status(500).json({ error: "Failed to list cards" });
  }
});

// POST /cards
router.post("/cards", async (req, res) => {
  const parsed = CreateCardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const [card] = await db
      .insert(cardsTable)
      .values({ ...parsed.data, status: "pending" })
      .returning();
    res.status(201).json(card);
  } catch (err) {
    req.log.error({ err }, "Failed to create card");
    res.status(500).json({ error: "Failed to create card" });
  }
});

// GET /cards/:id
router.get("/cards/:id", async (req, res) => {
  const parsed = GetCardParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  try {
    const [card] = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.id, parsed.data.id))
      .limit(1);
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json(card);
  } catch (err) {
    req.log.error({ err }, "Failed to get card");
    res.status(500).json({ error: "Failed to get card" });
  }
});

// PATCH /cards/:id
router.patch("/cards/:id", async (req, res) => {
  const paramsParsed = UpdateCardParams.safeParse(req.params);
  const bodyParsed = UpdateCardBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  try {
    const [card] = await db
      .update(cardsTable)
      .set({ ...bodyParsed.data, updatedAt: new Date() })
      .where(eq(cardsTable.id, paramsParsed.data.id))
      .returning();
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json(card);
  } catch (err) {
    req.log.error({ err }, "Failed to update card");
    res.status(500).json({ error: "Failed to update card" });
  }
});

// DELETE /cards/:id
router.delete("/cards/:id", async (req, res) => {
  const parsed = DeleteCardParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  try {
    await db.delete(cardsTable).where(eq(cardsTable.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete card");
    res.status(500).json({ error: "Failed to delete card" });
  }
});

// GET /cards/:id/description-preview
router.get("/cards/:id/description-preview", async (req, res) => {
  const parsed = GetCardParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  try {
    const [card] = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.id, parsed.data.id))
      .limit(1);
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    const html = generateDescription(card);
    const title = generateTitle(card);
    res.json({ html, title });
  } catch (err) {
    req.log.error({ err }, "Failed to generate description preview");
    res.status(500).json({ error: "Failed to generate description preview" });
  }
});

// GET /cards/:id/pricing
router.get("/cards/:id/pricing", async (req, res) => {
  const parsed = GetCardPricingParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  try {
    const [card] = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.id, parsed.data.id))
      .limit(1);
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    const pricing = await fetchSuggestedPrice(card);

    // Persist updated price
    if (pricing.suggestedPrice !== null) {
      await db
        .update(cardsTable)
        .set({ suggestedPrice: pricing.suggestedPrice, updatedAt: new Date() })
        .where(eq(cardsTable.id, parsed.data.id));
    }

    res.json({
      cardId: parsed.data.id,
      averagePrice: pricing.averagePrice,
      lowestPrice: pricing.lowestPrice,
      highestPrice: pricing.highestPrice,
      suggestedPrice: pricing.suggestedPrice,
      soldCount: pricing.soldCount,
      ebayFvfRate: EBAY_FVF_RATE,
      shippingCost: SHIPPING_COST,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get pricing");
    res.status(500).json({ error: "Failed to get pricing" });
  }
});

// POST /cards/reprice-all
// Re-prices all cards (or just needsPriceReview=true) using TCGPlayer market data
router.post("/cards/reprice-all", async (req, res) => {
  const reviewOnly = req.query.reviewOnly !== "false";
  try {
    const where = reviewOnly
      ? and(eq(cardsTable.needsPriceReview, true))
      : undefined;

    const cards = await db
      .select({ id: cardsTable.id, cardName: cardsTable.cardName, setName: cardsTable.setName, cardNumber: cardsTable.cardNumber, holoType: cardsTable.holoType })
      .from(cardsTable)
      .where(where);

    res.json({ started: true, total: cards.length });

    // Background re-pricing: 3 concurrent, 1 s delay between batches
    // Keeps requests under 60/min for the anonymous Pokemon TCG API tier
    (async () => {
      const CONCURRENCY = 3;
      const BATCH_DELAY_MS = 1000;
      for (let i = 0; i < cards.length; i += CONCURRENCY) {
        const batch = cards.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (card) => {
          try {
            const pricing = await fetchSuggestedPrice(card);
            if (pricing.suggestedPrice !== null) {
              await db.update(cardsTable).set({
                suggestedPrice: pricing.suggestedPrice,
                needsPriceReview: false,
                updatedAt: new Date(),
              }).where(eq(cardsTable.id, card.id));
              await db.update(listingsTable).set({
                price: pricing.suggestedPrice,
                updatedAt: new Date(),
              }).where(eq(listingsTable.cardId, card.id));
            }
          } catch { /* skip card on error */ }
        }));
        // Rate-limit pause — 3 req/s stays well under 60/min anonymous limit
        if (i + CONCURRENCY < cards.length) {
          await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
      }
    })();
  } catch (err) {
    req.log.error({ err }, "Failed to start reprice-all");
    res.status(500).json({ error: "Failed to start repricing" });
  }
});

// POST /cards/reprice-selected
// Re-prices a specific set of cards by ID
router.post("/cards/reprice-selected", async (req, res) => {
  const { cardIds } = req.body as { cardIds?: number[] };
  if (!Array.isArray(cardIds) || cardIds.length === 0) {
    res.status(400).json({ error: "cardIds must be a non-empty array" });
    return;
  }
  try {
    const cards = await db
      .select({ id: cardsTable.id, cardName: cardsTable.cardName, setName: cardsTable.setName, cardNumber: cardsTable.cardNumber, holoType: cardsTable.holoType })
      .from(cardsTable)
      .where(inArray(cardsTable.id, cardIds));

    res.json({ started: true, total: cards.length });

    (async () => {
      const CONCURRENCY = 3;
      for (let i = 0; i < cards.length; i += CONCURRENCY) {
        const batch = cards.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (card) => {
          try {
            const pricing = await fetchSuggestedPrice(card);
            if (pricing.suggestedPrice !== null) {
              await db.update(cardsTable).set({
                suggestedPrice: pricing.suggestedPrice,
                needsPriceReview: false,
                updatedAt: new Date(),
              }).where(eq(cardsTable.id, card.id));
              await db.update(listingsTable).set({
                price: pricing.suggestedPrice,
                updatedAt: new Date(),
              }).where(eq(listingsTable.cardId, card.id));
            }
          } catch { /* skip card on error */ }
        }));
        if (i + CONCURRENCY < cards.length) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    })();
  } catch (err) {
    req.log.error({ err }, "Failed to start reprice-selected");
    res.status(500).json({ error: "Failed to start repricing" });
  }
});

// GET /cards/export/ebay-csv
// Generates an eBay File Exchange CSV ready to upload to Seller Hub
router.get("/cards/export/ebay-csv", async (req, res) => {
  try {
    const cards = await db
      .select()
      .from(cardsTable)
      .where(sql`${cardsTable.suggestedPrice} IS NOT NULL`)
      .orderBy(desc(cardsTable.createdAt));

    if (cards.length === 0) {
      res.status(404).json({ error: "No priced cards to export" });
      return;
    }

    // All raw/ungraded cards use ConditionID 4000 (Ungraded) on eBay.
    // The visual condition is expressed via CD:Card Condition.
    const cardCondition = (quality: string | null): string => {
      const q = (quality ?? "").toLowerCase();
      if (q.includes("near mint") || q.includes("nm") || q.includes("mint")) return "Near mint or better";
      if (q.includes("lightly played") || q.includes("lp") || q.includes("excellent")) return "Lightly played (Excellent)";
      if (q.includes("moderately played") || q.includes("mp")) return "Moderately played (Very good)";
      if (q.includes("heavily played") || q.includes("hp")) return "Heavily played (Poor)";
      if (q.includes("damaged") || q.includes("poor")) return "Heavily played (Poor)";
      return "Near mint or better"; // default
    };

    // Use the canonical generators so "Export to eBay CSV" and "Preview Description"
    // always produce identical output.
    const makeTitle = generateTitle;
    const makeDescription = generateDescription;

    // eBay File Exchange header — the action column encodes metadata
    const ACTION_HEADER = "*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)";
    const location = process.env.EBAY_LOCATION ?? "";

    const columns = [
      ACTION_HEADER,
      "*Category",
      "*Title",
      "*StartPrice",
      "*Quantity",
      "*Format",
      "*Duration",
      "ConditionID",
      "Description",
      "PicURL",
      "Location",
      "DispatchTimeMax",
      "ShippingType",
      "ShippingService-1:Option",
      "ShippingService-1:Cost",
      "ReturnsAcceptedOption",
      "C:Game",
      "CD:Card Condition",
    ];

    const escape = (val: string | number) =>
      `"${String(val).replace(/"/g, '""')}"`;

    // Backfill image URLs for any cards missing them (scanned before this feature was added)
    const missingImage = cards.filter(c => !c.tcgImageUrl);
    if (missingImage.length > 0) {
      await Promise.all(missingImage.map(async (card) => {
        const url = await fetchTcgImageUrl({ cardName: card.cardName, cardNumber: card.cardNumber });
        if (url) {
          card.tcgImageUrl = url;
          await db.update(cardsTable).set({ tcgImageUrl: url, updatedAt: new Date() }).where(eq(cardsTable.id, card.id));
        }
      }));
    }

    const rows = cards.map((card) => [
      "Add",                           // Action
      "183454",                        // Pokemon Individual Cards category
      makeTitle(card),                 // Title (≤80 chars)
      card.suggestedPrice!.toFixed(2), // StartPrice
      "1",                             // Quantity
      "FixedPrice",                    // Format
      "GTC",                           // Duration (Good Till Cancelled)
      4000,                            // ConditionID: Ungraded (raw card)
      makeDescription(card),           // Description
      card.tcgImageUrl ?? "",          // PicURL (pokemontcg.io high-res image)
      location,                        // Location (required by eBay)
      "3",                             // DispatchTimeMax: 3 business days
      "Flat",                          // ShippingType
      "USPSFirstClass",                // ShippingService
      SHIPPING_COST.toFixed(2),        // Shipping cost to buyer
      "ReturnsNotAccepted",            // Returns
      "Pokémon",                       // C:Game
      cardCondition(card.quality),     // CD:Card Condition
    ].map(escape).join(","));

    const csv = [columns.map(escape).join(","), ...rows].join("\r\n");

    const filename = `fischtcg-ebay-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, "Failed to export eBay CSV");
    res.status(500).json({ error: "Failed to generate CSV" });
  }
});

export default router;
