import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, listingsTable } from "@workspace/db";
import { eq, desc, and, like, or, sql, count } from "drizzle-orm";
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
import { searchSoldListings } from "../lib/ebay";
import { randomUUID } from "crypto";

const router = Router();

// ─── Pricing constants ────────────────────────────────────────────────────────
const EBAY_FVF_RATE = 0.1325;   // 13.25% final value fee
const EBAY_ORDER_FEE = 0.30;    // per-order fee
const SHIPPING_COST = 0.78;     // seller shipping cost

/**
 * Build the eBay search query string from card fields.
 */
function buildPricingQuery(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  holoType?: string | null;
}): string {
  const parts: string[] = [];
  if (card.cardName) parts.push(card.cardName);
  if (card.setName) parts.push(card.setName);
  if (card.cardNumber) parts.push(`#${card.cardNumber}`);
  if (card.holoType === "holo") parts.push("holo");
  else if (card.holoType === "reverse_holo") parts.push("reverse holo");
  parts.push("pokemon card");
  return parts.join(" ");
}

/**
 * Fetch sold listings, compute average, then apply eBay fees + shipping so the
 * suggested list price nets the seller approximately the market average.
 *
 * Formula: listPrice = (avgSold + orderFee + shippingCost) / (1 - fvfRate)
 */
async function fetchSuggestedPrice(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  holoType?: string | null;
}): Promise<{
  suggestedPrice: number | null;
  averagePrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  soldCount: number;
}> {
  const query = buildPricingQuery(card);
  const soldListings = await searchSoldListings(query);
  const prices = soldListings.map((l) => l.price).filter((p) => p > 0);

  if (prices.length === 0) {
    return { suggestedPrice: null, averagePrice: null, lowestPrice: null, highestPrice: null, soldCount: 0 };
  }

  const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);

  // Minimum price: break-even + $0.01 profit
  // breakEven = (orderFee + shippingCost + minProfit) / (1 - fvfRate)
  const MIN_PROFIT = 0.01;
  const breakEven = Math.ceil(((EBAY_ORDER_FEE + SHIPPING_COST + MIN_PROFIT) / (1 - EBAY_FVF_RATE)) * 100) / 100;

  // Price at market average, but never below break-even
  const suggestedPrice = Math.max(Math.round(averagePrice * 100) / 100, breakEven);

  return { suggestedPrice, averagePrice, lowestPrice, highestPrice, soldCount: prices.length };
}

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

    // Save the image as data URL and create a card record
    const imageUrl = parsed.data.imageBase64.startsWith("data:")
      ? null // Don't store full base64 in DB — just the analysis result
      : null;

    // Fetch pricing in parallel with DB insert
    const [insertResult, pricing] = await Promise.all([
      db
        .insert(cardsTable)
        .values({
          imageUrl,
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

    // Save suggested price immediately if found
    if (pricing.suggestedPrice !== null) {
      await db
        .update(cardsTable)
        .set({ suggestedPrice: pricing.suggestedPrice, updatedAt: new Date() })
        .where(eq(cardsTable.id, card.id));
    }

    res.json({
      cardId: card.id,
      cardName: analysis.cardName,
      setName: analysis.setName,
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
            })
            .returning(),
          fetchSuggestedPrice(analysis),
        ]);
        const card = insertResult[0];
        if (pricing.suggestedPrice !== null) {
          await db
            .update(cardsTable)
            .set({ suggestedPrice: pricing.suggestedPrice, updatedAt: new Date() })
            .where(eq(cardsTable.id, card.id));
        }
        job.results.push(card.id);
      } catch {
        // Skip failed images
      }
      job.processed += 1;
    }
    job.done = true;
  })();

  res.json({ jobId, total });
});

// GET /cards/batch-analyze/:jobId/progress (SSE)
router.get("/cards/batch-analyze/:jobId/progress", (req, res) => {
  const parsed = GetBatchProgressParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  const { jobId } = parsed.data;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    const job = batchJobs.get(jobId);
    if (!job) {
      res.write(
        `data: ${JSON.stringify({ error: "Job not found" })}\n\n`,
      );
      clearInterval(interval);
      res.end();
      return;
    }
    res.write(
      `data: ${JSON.stringify({
        processed: job.processed,
        total: job.total,
        done: job.done,
        cardIds: job.done ? job.results : undefined,
      })}\n\n`,
    );
    if (job.done) {
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on("close", () => clearInterval(interval));
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
    if (holoType) conditions.push(eq(cardsTable.holoType, holoType as "standard" | "holo" | "reverse_holo"));
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

    // eBay condition IDs for trading cards
    const conditionId = (quality: string | null): number => {
      const q = (quality ?? "").toLowerCase();
      if (q.includes("near mint") || q.includes("nm") || q.includes("mint")) return 2750;
      if (q.includes("lightly played") || q.includes("lp") || q.includes("excellent")) return 3000;
      if (q.includes("moderately played") || q.includes("mp")) return 4000;
      if (q.includes("heavily played") || q.includes("hp")) return 5000;
      if (q.includes("damaged") || q.includes("poor")) return 7000;
      return 3000; // default: Very Good
    };

    const holoLabel = (holoType: string | null): string => {
      if (holoType === "holo") return "Holo";
      if (holoType === "reverse_holo") return "Reverse Holo";
      return "";
    };

    const makeTitle = (card: typeof cards[0]): string => {
      const parts = [
        card.cardName,
        card.setName,
        card.cardNumber ? `#${card.cardNumber}` : null,
        holoLabel(card.holoType),
        "Pokemon Card",
        card.quality,
      ].filter(Boolean).join(" ");
      return parts.slice(0, 80); // eBay title limit
    };

    const makeDescription = (card: typeof cards[0]): string => {
      return [
        `<b>${card.cardName}</b>`,
        card.setName ? `Set: ${card.setName}` : null,
        card.cardNumber ? `Card Number: #${card.cardNumber}` : null,
        card.year ? `Year: ${card.year}` : null,
        card.rarity ? `Rarity: ${card.rarity}` : null,
        card.holoType ? `Foil: ${holoLabel(card.holoType) || "Standard"}` : null,
        card.quality ? `Condition: ${card.quality}` : null,
        card.language ? `Language: ${card.language}` : null,
        `<br>Listed by FischTCG. Fast shipping, tracked via USPS.`,
      ].filter(Boolean).join("<br>");
    };

    // eBay File Exchange header — the action column encodes metadata
    const ACTION_HEADER = "*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)";
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
      "ShippingType",
      "ShippingService-1:Option",
      "ShippingService-1:Cost",
      "ReturnsAcceptedOption",
    ];

    const escape = (val: string | number) =>
      `"${String(val).replace(/"/g, '""')}"`;

    const rows = cards.map((card) => [
      "Add",                          // Action
      "183454",                        // Pokemon Individual Cards category
      makeTitle(card),                 // Title (≤80 chars)
      card.suggestedPrice!.toFixed(2), // StartPrice
      "1",                             // Quantity
      "FixedPrice",                    // Format
      "GTC",                           // Duration (Good Till Cancelled)
      conditionId(card.quality),       // ConditionID
      makeDescription(card),           // Description
      "Flat",                          // ShippingType
      "USPSFirstClass",                // ShippingService
      SHIPPING_COST.toFixed(2),        // Shipping cost to buyer
      "ReturnsNotAccepted",            // Returns
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
