---
name: Drizzle raw SQL fallback
description: Drizzle ORM generates malformed parameterized SQL for some tables on certain installed versions; use pool.query() raw SQL as a safe fallback.
---

## Rule

If a Drizzle insert/update produces an error like "Failed query: … $6, $6 … $5 missing", switch that operation to raw `pool.query()` from `@workspace/db`.

## Example fix

```typescript
// Instead of: await db.insert(importJobsTable).values({ id, total, ... })
await pool.query(
  `INSERT INTO import_jobs (id, total, processed, done, imported, priced, errors, not_priced)
   VALUES ($1, $2, 0, false, 0, 0, 0, 0)`,
  [id, total],
);
```

**Why:** User's local pnpm install had a drizzle-orm version mismatch with what the task agent wrote against. The ORM's SQL builder generated duplicate parameter placeholders ($6 twice, $5 missing) causing a Postgres error. Raw SQL bypasses the ORM builder entirely and is immune to version drift.

**How to apply:** `pool` is exported from `@workspace/db` alongside `db`. Import it and use `pool.query(sql, params)` for any table that shows this symptom.
