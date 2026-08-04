import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ebayTokensTable = pgTable("ebay_tokens", {
  id: serial("id").primaryKey(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  username: text("username"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertEbayTokenSchema = createInsertSchema(ebayTokensTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertEbayToken = z.infer<typeof insertEbayTokenSchema>;
export type EbayToken = typeof ebayTokensTable.$inferSelect;
