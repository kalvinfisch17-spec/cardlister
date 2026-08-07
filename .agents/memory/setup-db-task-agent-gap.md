---
name: setup-db.sql task agent gap
description: Task agents add Drizzle schema files but routinely forget to update setup-db.sql; always audit after merges.
---

## Rule

After any task agent merge that adds a new table or column to `lib/db/src/schema/`, manually verify that `scripts/setup-db.sql` also contains the matching `CREATE TABLE` or `ALTER TABLE` statement.

**Why:** Task agents added `import_jobs` table and `needs_price_review` column to the Drizzle schema but did not update `setup-db.sql`. The user's local PostgreSQL had none of the required tables because they had never run the full setup script, and the missing entries meant re-running it didn't help either.

**How to apply:** After every merge, diff the schema files against setup-db.sql. Add any missing tables/columns before declaring the merge complete.
