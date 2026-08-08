import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  boolean,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const holoTypeEnum = pgEnum("holo_type", [
  "standard",
  "holo",
  "reverse_holo",
  "cosmo_holo",
]);

export const cardStatusEnum = pgEnum("card_status", [
  "pending",
  "reviewed",
  "listed",
  "sold",
]);

export const cardsTable = pgTable("cards", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url"),
  imageUrlBack: text("image_url_back"),
  cardName: text("card_name"),
  setName: text("set_name"),
  cardNumber: text("card_number"),
  year: text("year"),
  quality: text("quality"),
  holoType: holoTypeEnum("holo_type"),
  language: text("language"),
  rarity: text("rarity"),
  notes: text("notes"),
  status: cardStatusEnum("status").default("pending").notNull(),
  suggestedPrice: real("suggested_price"),
  tcgImageUrl: text("tcg_image_url"),
  needsPriceReview: boolean("needs_price_review").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCardSchema = createInsertSchema(cardsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCard = z.infer<typeof insertCardSchema>;
export type Card = typeof cardsTable.$inferSelect;
