---
name: PostgreSQL 18 CREATE TYPE
description: CREATE TYPE IF NOT EXISTS is not valid SQL in PostgreSQL — use DO blocks instead.
---

## Rule

Never write `CREATE TYPE IF NOT EXISTS`. PostgreSQL does not support this syntax (any version).

## Correct pattern

```sql
DO $$ BEGIN
  CREATE TYPE my_enum AS ENUM ('a', 'b');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```

**Why:** User hit `syntax error at or near "NOT"` on PostgreSQL 18. The setup-db.sql was using the invalid syntax. Tables support IF NOT EXISTS; types do not.

**How to apply:** Any time setup-db.sql or a migration creates a ENUM/composite type, use the DO block pattern.
