import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { cardsTable } from "./cards";

export const listingStatusEnum = pgEnum("listing_status", [
  "draft",
  "active",
  "sold",
  "ended",
]);

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  cardId: integer("card_id")
    .notNull()
    .references(() => cardsTable.id, { onDelete: "cascade" }),
  ebayListingId: text("ebay_listing_id"),
  title: text("title"),
  description: text("description"),
  price: real("price"),
  status: listingStatusEnum("status").default("draft").notNull(),
  ebayUrl: text("ebay_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
