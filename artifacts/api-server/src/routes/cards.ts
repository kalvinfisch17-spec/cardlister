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

    const [card] = await db
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
      .returning();

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
        const [card] = await db
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
          .returning();
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

    const queryParts: string[] = [];
    if (card.cardName) queryParts.push(card.cardName);
    if (card.setName) queryParts.push(card.setName);
    if (card.cardNumber) queryParts.push(`#${card.cardNumber}`);
    if (card.holoType === "holo") queryParts.push("holo");
    else if (card.holoType === "reverse_holo") queryParts.push("reverse holo");
    queryParts.push("pokemon card");

    const soldListings = await searchSoldListings(queryParts.join(" "));

    const prices = soldListings.map((l) => l.price).filter((p) => p > 0);
    const averagePrice =
      prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : null;
    const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
    const highestPrice = prices.length > 0 ? Math.max(...prices) : null;
    // Suggested price: 90th percentile or average
    const suggestedPrice = averagePrice ? Math.round(averagePrice * 0.95 * 100) / 100 : null;

    // Update suggested price on card
    if (suggestedPrice) {
      await db
        .update(cardsTable)
        .set({ suggestedPrice, updatedAt: new Date() })
        .where(eq(cardsTable.id, parsed.data.id));
    }

    res.json({
      cardId: parsed.data.id,
      averagePrice,
      lowestPrice,
      highestPrice,
      suggestedPrice,
      soldListings,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get pricing");
    res.status(500).json({ error: "Failed to get pricing" });
  }
});

export default router;
