import { Router } from "express";
import { db } from "@workspace/db";
import { cardsTable, listingsTable, importJobsTable } from "@workspace/db";
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
import { fetchSuggestedPrice } from "../lib/pricing";
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

// ─── CSV / Title parsing helpers ─────────────────────────────────────────────

/** Normalise a header string for reliable lookup */
function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function parseCsv(content: string): { rows: Record<string, string>[]; detectedHeaders: string[] } {
  // Strip UTF-8 BOM if present
  const clean = content.replace(/^\uFEFF/, "");
  const allLines = clean.split(/\r?\n/);
  const lines = allLines.filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], detectedHeaders: [] };

  // Detect delimiter from the line with the most delimiters (handles preamble rows)
  const tabCounts = lines.map((l) => (l.match(/\t/g) ?? []).length);
  const commaCounts = lines.map((l) => (l.match(/,/g) ?? []).length);
  const maxTab = Math.max(...tabCounts);
  const maxComma = Math.max(...commaCounts);
  const delim = maxTab >= maxComma ? "\t" : ",";

  const parseRow = (line: string): string[] => {
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === delim && !inQuotes) {
        fields.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    return fields;
  };

  // eBay exports sometimes have preamble rows before the real header.
  // Find the first row whose normalised fields include something that looks
  // like "item" and "title" — that's the real header row.
  const ITEM_KEYS = ["item number", "item id", "itemid", "item no", "listing id"];
  const TITLE_KEYS = ["title", "listing title", "item title"];

  let headerLineIdx = 0;
  for (let i = 0; i < Math.min(lines.length - 1, 10); i++) {
    const fields = parseRow(lines[i]).map(normHeader);
    const hasItem = fields.some((f) => ITEM_KEYS.some((k) => f === k || f.includes("item")));
    const hasTitle = fields.some((f) => TITLE_KEYS.some((k) => f === k));
    if (hasItem && hasTitle) { headerLineIdx = i; break; }
    // Fallback: pick the row with the most columns
    if (fields.length > parseRow(lines[headerLineIdx]).length) headerLineIdx = i;
  }

  const headers = parseRow(lines[headerLineIdx]).map(normHeader);

  const rows = lines
    .slice(headerLineIdx + 1)
    .filter((l) => l.trim())
    .map((line) => {
      const values = parseRow(line);
      return Object.fromEntries(headers.map((h, i) => [h, (values[i] ?? "").trim()]));
    });

  return { rows, detectedHeaders: headers };
}

function getField(row: Record<string, string>, ...keys: string[]): string | null {
  for (const key of keys) {
    const val = row[key.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim()];
    if (val && val.trim()) return val.trim();
  }
  return null;
}

function parsePokemonTitle(title: string): {
  cardName: string | null;
  setName: string | null;
  cardNumber: string | null;
  year: string | null;
  quality: string | null;
  holoType: "standard" | "holo" | "reverse_holo";
} {
  let rem = title;

  // Year
  const yearMatch = rem.match(/\b(199\d|20[0-3]\d)\b/);
  const year = yearMatch?.[1] ?? null;
  if (year) rem = rem.replace(year, " ");

  // Strip "Pokemon Card(s)" / TCG
  rem = rem.replace(/\bpok[eé]mon\s+cards?\b/gi, " ");
  rem = rem.replace(/\bTCG\b/gi, " ");

  // Quality — longest match first
  const QUALITY: [RegExp, string][] = [
    [/\bnear[\s-]?mint\b/gi, "NM"],
    [/\blightly[\s-]?played\b/gi, "LP"],
    [/\bmoderately[\s-]?played\b/gi, "MP"],
    [/\bheavily[\s-]?played\b/gi, "HP"],
    [/\bnm[\s-]?mt\b/gi, "NM"],
    [/\bdamaged\b/gi, "D"],
    [/\bvery[\s-]?good\b/gi, "LP"],
    [/\bexcellent\b/gi, "LP"],
    [/\bgood\b/gi, "MP"],
    [/\bmint\b/gi, "NM"],
    [/(?<![a-z])nm(?![a-z])/gi, "NM"],
    [/(?<![a-z])lp(?![a-z])/gi, "LP"],
    [/(?<![a-z])mp(?![a-z])/gi, "MP"],
  ];
  let quality: string | null = null;
  for (const [re, code] of QUALITY) {
    if (re.test(rem)) { quality = code; rem = rem.replace(re, " "); break; }
  }

  // Holo type — reverse holo first
  let holoType: "standard" | "holo" | "reverse_holo" = "standard";
  if (/\breverse[\s-]?holo\b/i.test(rem)) {
    holoType = "reverse_holo";
    rem = rem.replace(/\breverse[\s-]?holo\b/gi, " ");
  } else if (/\bholo(?:graphic|foil)?\b/i.test(rem) && !/\bnon[\s-]?holo\b/i.test(rem)) {
    holoType = "holo";
    rem = rem.replace(/\bholo(?:graphic|foil)?\b/gi, " ");
  }

  // Card number
  const numMatch = rem.match(/#(\d+(?:\/\d+)?)/);
  const cardNumber = numMatch?.[1] ?? null;
  if (numMatch) rem = rem.replace(numMatch[0], " ");

  rem = rem.replace(/[#|•·]+/g, " ").replace(/\s+/g, " ").trim();

  return { cardName: rem || null, setName: null, cardNumber, year, quality, holoType };
}

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

// POST /listings/import/ebay-csv
router.post("/listings/import/ebay-csv", async (req, res) => {
  const { csvContent } = req.body ?? {};
  if (!csvContent || typeof csvContent !== "string") {
    res.status(400).json({ error: "csvContent is required" });
    return;
  }

  const { rows, detectedHeaders } = parseCsv(csvContent);
  const validRows = rows.filter((row) => {
    const itemId = getField(row, "item number", "item id", "itemid", "item no", "listing id");
    const title = getField(row, "title", "listing title", "item title");
    return itemId && title;
  });

  if (validRows.length === 0) {
    const headerSample = detectedHeaders.slice(0, 10).join(", ") || "(none detected)";
    res.status(400).json({
      error: `No valid rows found. Need columns for item number and title. Detected headers: [${headerSample}]`,
    });
    return;
  }

  const jobId = randomUUID();

  // Persist job to DB so progress survives server restarts
  await db.insert(importJobsTable).values({
    id: jobId,
    total: validRows.length,
    processed: 0,
    done: false,
    imported: 0,
    priced: 0,
    errors: 0,
    notPriced: 0,
  });

  res.json({ jobId, total: validRows.length });

  // Process in background with concurrency of 5
  // We track counters locally and flush to DB after each batch for efficiency
  (async () => {
    let processed = 0;
    let imported = 0;
    let priced = 0;
    let errors = 0;
    let notPriced = 0;

    const flushProgress = async (done = false) => {
      await db
        .update(importJobsTable)
        .set({ processed, imported, priced, errors, notPriced, done, updatedAt: new Date() })
        .where(eq(importJobsTable.id, jobId));
    };

    const CONCURRENCY = 5;

    for (let i = 0; i < validRows.length; i += CONCURRENCY) {
      const batch = validRows.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const itemId = getField(row, "item number", "item id", "itemid", "item")!;
            const title = getField(row, "title", "listing title", "item title")!;
            const currentPrice =
              parseFloat(
                getField(row, "current price", "price", "start price", "buy it now price") ?? "0",
              ) || null;

            const parsed = parsePokemonTitle(title);

            // Insert card
            const [card] = await db
              .insert(cardsTable)
              .values({
                cardName: parsed.cardName,
                setName: parsed.setName,
                cardNumber: parsed.cardNumber,
                year: parsed.year,
                quality: parsed.quality,
                holoType: parsed.holoType,
                language: "English",
                status: "reviewed",
              })
              .returning();

            // Fetch new price (fall back to original if eBay lookup fails)
            let finalPrice = currentPrice;
            let gotNewPrice = false;
            try {
              const pricing = await fetchSuggestedPrice(parsed);
              if (pricing.suggestedPrice !== null) {
                finalPrice = pricing.suggestedPrice;
                gotNewPrice = true;
                await db
                  .update(cardsTable)
                  .set({ suggestedPrice: finalPrice, updatedAt: new Date() })
                  .where(eq(cardsTable.id, card.id));
                priced++;
              }
            } catch { /* keep original price */ }

            if (!gotNewPrice) {
              // Mark card as needing manual price review
              await db
                .update(cardsTable)
                .set({ needsPriceReview: true, updatedAt: new Date() })
                .where(eq(cardsTable.id, card.id));
              notPriced++;
            }

            // Generate new title + description
            const newTitle = generateTitle({ ...parsed, rarity: null });
            const newDescription = generateDescription({ ...parsed, rarity: null, notes: null });

            // Insert listing with eBay item ID
            await db.insert(listingsTable).values({
              cardId: card.id,
              ebayListingId: itemId,
              title: newTitle,
              description: newDescription,
              price: finalPrice ?? undefined,
              status: "active",
              ebayUrl: `https://www.ebay.com/itm/${itemId}`,
            });

            // Mark card as listed
            await db
              .update(cardsTable)
              .set({ status: "listed", updatedAt: new Date() })
              .where(eq(cardsTable.id, card.id));

            imported++;
          } catch {
            errors++;
          }
          processed++;
        }),
      );

      // Flush progress to DB after each batch
      await flushProgress(false);
    }

    // Mark job as done
    await flushProgress(true);
  })();
});

// GET /listings/import/:jobId/progress
router.get("/listings/import/:jobId/progress", async (req, res) => {
  const { jobId } = req.params;
  try {
    const [job] = await db
      .select()
      .from(importJobsTable)
      .where(eq(importJobsTable.id, jobId))
      .limit(1);

    if (!job) {
      res.status(404).json({ error: "Job not found. The server may have restarted — please start a new import." });
      return;
    }

    res.json({
      processed: job.processed,
      total: job.total,
      done: job.done,
      imported: job.imported,
      priced: job.priced,
      errors: job.errors,
      notPriced: job.notPriced,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get import job progress");
    res.status(500).json({ error: "Failed to retrieve job progress" });
  }
});

// GET /listings/export/ebay-csv-revise
// Generates an eBay File Exchange Revise CSV for all listings that have an ebayListingId
router.get("/listings/export/ebay-csv-revise", async (req, res) => {
  try {
    const listings = await db
      .select({
        id: listingsTable.id,
        ebayListingId: listingsTable.ebayListingId,
        title: listingsTable.title,
        description: listingsTable.description,
        price: listingsTable.price,
      })
      .from(listingsTable)
      .where(and(
        // only rows that actually have an eBay item ID
        eq(listingsTable.status, "active"),
      ))
      .orderBy(desc(listingsTable.createdAt));

    // Filter in JS so we don't need a raw sql IS NOT NULL expression
    const revisable = listings.filter(
      (l) => l.ebayListingId && l.ebayListingId.trim() !== "" && l.price != null,
    );

    if (revisable.length === 0) {
      res.status(404).json({ error: "No active listings with an eBay Item ID to export" });
      return;
    }

    // eBay File Exchange Revise format
    const ACTION_HEADER = "*Action(SiteID=US|Country=US|Currency=USD|Version=1193|CC=UTF-8)";
    const columns = [
      ACTION_HEADER,
      "ItemID",
      "*Title",
      "StartPrice",
      "Description",
    ];

    const escape = (val: string | number | null | undefined): string =>
      `"${String(val ?? "").replace(/"/g, '""')}"`;

    const rows = revisable.map((listing) => [
      "Revise",
      listing.ebayListingId!,
      (listing.title ?? "").slice(0, 80),
      listing.price!.toFixed(2),
      listing.description ?? "",
    ].map(escape).join(","));

    const csv = [columns.map(escape).join(","), ...rows].join("\r\n");

    const filename = `fischtcg-ebay-revise-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    req.log.error({ err }, "Failed to export eBay Revise CSV");
    res.status(500).json({ error: "Failed to generate Revise CSV" });
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
