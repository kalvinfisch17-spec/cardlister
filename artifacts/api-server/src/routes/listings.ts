import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, listingsTable } from "@workspace/db";
import { eq, desc, and, sum, count } from "drizzle-orm";
import {
  CreateListingBody,
  BulkCreateListingsBody,
  ListListingsQueryParams,
  GetListingParams,
  DeleteListingParams,
  GetBulkListingProgressParams,
} from "@workspace/api-zod";
import {
  getSavedToken,
  createEbayListing,
  generateTitle,
  generateDescription,
} from "../lib/ebay";
import { randomUUID } from "crypto";

const router = Router();

// In-memory store for bulk listing jobs
const bulkJobs = new Map<
  string,
  {
    total: number;
    processed: number;
    done: boolean;
    listingIds: number[];
  }
>();

// GET /listings/stats
router.get("/listings/stats", async (req, res) => {
  try {
    const [totalResult] = await db.select({ count: count() }).from(listingsTable);
    const [draftResult] = await db.select({ count: count() }).from(listingsTable).where(eq(listingsTable.status, "draft"));
    const [activeResult] = await db.select({ count: count() }).from(listingsTable).where(eq(listingsTable.status, "active"));
    const [soldResult] = await db.select({ count: count() }).from(listingsTable).where(eq(listingsTable.status, "sold"));
    const [endedResult] = await db.select({ count: count() }).from(listingsTable).where(eq(listingsTable.status, "ended"));
    const [revenueResult] = await db.select({ total: sum(listingsTable.price) }).from(listingsTable).where(eq(listingsTable.status, "sold"));

    const recentListings = await db
      .select({
        id: listingsTable.id,
        cardId: listingsTable.cardId,
        ebayListingId: listingsTable.ebayListingId,
        title: listingsTable.title,
        description: listingsTable.description,
        price: listingsTable.price,
        status: listingsTable.status,
        ebayUrl: listingsTable.ebayUrl,
        createdAt: listingsTable.createdAt,
        updatedAt: listingsTable.updatedAt,
        card: cardsTable,
      })
      .from(listingsTable)
      .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
      .orderBy(desc(listingsTable.createdAt))
      .limit(5);

    res.json({
      total: Number(totalResult?.count ?? 0),
      draft: Number(draftResult?.count ?? 0),
      active: Number(activeResult?.count ?? 0),
      sold: Number(soldResult?.count ?? 0),
      ended: Number(endedResult?.count ?? 0),
      totalRevenue: parseFloat(String(revenueResult?.total ?? "0")) || 0,
      recentListings,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get listing stats");
    res.status(500).json({ error: "Failed to get listing stats" });
  }
});

// GET /listings
router.get("/listings", async (req, res) => {
  const parsed = ListListingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }
  try {
    const conditions = [];
    if (parsed.data.status) {
      conditions.push(eq(listingsTable.status, parsed.data.status as "draft" | "active" | "sold" | "ended"));
    }

    const listings = await db
      .select({
        id: listingsTable.id,
        cardId: listingsTable.cardId,
        ebayListingId: listingsTable.ebayListingId,
        title: listingsTable.title,
        description: listingsTable.description,
        price: listingsTable.price,
        status: listingsTable.status,
        ebayUrl: listingsTable.ebayUrl,
        createdAt: listingsTable.createdAt,
        updatedAt: listingsTable.updatedAt,
        card: cardsTable,
      })
      .from(listingsTable)
      .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(listingsTable.createdAt));

    res.json(listings);
  } catch (err) {
    req.log.error({ err }, "Failed to list listings");
    res.status(500).json({ error: "Failed to list listings" });
  }
});

// POST /listings
router.post("/listings", async (req, res) => {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  try {
    const [card] = await db
      .select()
      .from(cardsTable)
      .where(eq(cardsTable.id, parsed.data.cardId))
      .limit(1);

    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }

    const title = parsed.data.title ?? generateTitle(card);
    const description = parsed.data.description ?? generateDescription(card);
    const price = parsed.data.price ?? card.suggestedPrice ?? 0;

    const savedToken = await getSavedToken();

    let ebayListingId: string | undefined;
    let ebayUrl: string | undefined;
    let status: "draft" | "active" = "draft";

    if (savedToken && price > 0) {
      try {
        const result = await createEbayListing({
          accessToken: savedToken.accessToken,
          title,
          description,
          price,
          imageUrl: card.imageUrl,
        });
        ebayListingId = result.listingId;
        ebayUrl = result.listingUrl;
        status = "active";
      } catch (ebayErr) {
        req.log.warn({ ebayErr }, "eBay listing creation failed, saving as draft");
      }
    }

    const [listing] = await db
      .insert(listingsTable)
      .values({
        cardId: parsed.data.cardId,
        title,
        description,
        price,
        ebayListingId,
        ebayUrl,
        status,
      })
      .returning();

    // Update card status to listed
    await db
      .update(cardsTable)
      .set({ status: "listed", updatedAt: new Date() })
      .where(eq(cardsTable.id, parsed.data.cardId));

    res.status(201).json({ ...listing, card });
  } catch (err) {
    req.log.error({ err }, "Failed to create listing");
    res.status(500).json({ error: "Failed to create listing" });
  }
});

// POST /listings/bulk
router.post("/listings/bulk", async (req, res) => {
  const parsed = BulkCreateListingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const jobId = randomUUID();
  const cardIds = parsed.data.cardIds;
  bulkJobs.set(jobId, {
    total: cardIds.length,
    processed: 0,
    done: false,
    listingIds: [],
  });

  // Process in background
  (async () => {
    const job = bulkJobs.get(jobId)!;
    const savedToken = await getSavedToken();

    for (const cardId of cardIds) {
      try {
        const [card] = await db
          .select()
          .from(cardsTable)
          .where(eq(cardsTable.id, cardId))
          .limit(1);

        if (!card) {
          job.processed += 1;
          continue;
        }

        const title = generateTitle(card);
        const description = generateDescription(card);
        const price = card.suggestedPrice ?? 0;

        let ebayListingId: string | undefined;
        let ebayUrl: string | undefined;
        let status: "draft" | "active" = "draft";

        if (savedToken && price > 0) {
          try {
            const result = await createEbayListing({
              accessToken: savedToken.accessToken,
              title,
              description,
              price,
              imageUrl: card.imageUrl,
            });
            ebayListingId = result.listingId;
            ebayUrl = result.listingUrl;
            status = "active";
          } catch {
            // Fallback to draft
          }
        }

        const [listing] = await db
          .insert(listingsTable)
          .values({ cardId, title, description, price, ebayListingId, ebayUrl, status })
          .returning();

        await db
          .update(cardsTable)
          .set({ status: "listed", updatedAt: new Date() })
          .where(eq(cardsTable.id, cardId));

        job.listingIds.push(listing.id);
      } catch {
        // Skip failed cards
      }
      job.processed += 1;
    }
    job.done = true;
  })();

  res.json({ jobId, total: cardIds.length });
});

// GET /listings/bulk/:jobId/progress (SSE)
router.get("/listings/bulk/:jobId/progress", (req, res) => {
  const parsed = GetBulkListingProgressParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    const job = bulkJobs.get(parsed.data.jobId);
    if (!job) {
      res.write(`data: ${JSON.stringify({ error: "Job not found" })}\n\n`);
      clearInterval(interval);
      res.end();
      return;
    }
    res.write(
      `data: ${JSON.stringify({
        processed: job.processed,
        total: job.total,
        done: job.done,
        listingIds: job.done ? job.listingIds : undefined,
      })}\n\n`,
    );
    if (job.done) {
      clearInterval(interval);
      res.end();
    }
  }, 500);

  req.on("close", () => clearInterval(interval));
});

// GET /listings/:id
router.get("/listings/:id", async (req, res) => {
  const parsed = GetListingParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  try {
    const [listing] = await db
      .select({
        id: listingsTable.id,
        cardId: listingsTable.cardId,
        ebayListingId: listingsTable.ebayListingId,
        title: listingsTable.title,
        description: listingsTable.description,
        price: listingsTable.price,
        status: listingsTable.status,
        ebayUrl: listingsTable.ebayUrl,
        createdAt: listingsTable.createdAt,
        updatedAt: listingsTable.updatedAt,
        card: cardsTable,
      })
      .from(listingsTable)
      .leftJoin(cardsTable, eq(listingsTable.cardId, cardsTable.id))
      .where(eq(listingsTable.id, parsed.data.id))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    res.json(listing);
  } catch (err) {
    req.log.error({ err }, "Failed to get listing");
    res.status(500).json({ error: "Failed to get listing" });
  }
});

// DELETE /listings/:id
router.delete("/listings/:id", async (req, res) => {
  const parsed = DeleteListingParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  try {
    await db.delete(listingsTable).where(eq(listingsTable.id, parsed.data.id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete listing");
    res.status(500).json({ error: "Failed to delete listing" });
  }
});

export default router;
