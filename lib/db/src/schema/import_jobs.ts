import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

export const importJobsTable = pgTable("import_jobs", {
  id: text("id").primaryKey(), // UUID
  total: integer("total").notNull().default(0),
  processed: integer("processed").notNull().default(0),
  done: boolean("done").notNull().default(false),
  imported: integer("imported").notNull().default(0),
  priced: integer("priced").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  notPriced: integer("not_priced").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ImportJob = typeof importJobsTable.$inferSelect;
