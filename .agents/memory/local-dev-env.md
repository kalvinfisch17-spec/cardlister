---
name: Local dev DATABASE_URL
description: The API server requires a .env file at the repo root with DATABASE_URL for local Windows development.
---

## Rule

The API server reads `../../.env` (relative to `artifacts/api-server/`) at startup via `--env-file-if-exists`. If the file is missing it logs "not found" and continues — but then every DB operation fails with "password authentication failed".

## Required file

Create `<repo-root>/.env` (i.e. `C:\Users\Kalvi\cardlister\.env`) containing:

```
DATABASE_URL=postgresql://postgres:PASSWORD@localhost:5432/cardlister
```

**Why:** The repo root `.env` is gitignored. New clones don't have it. User got "password authentication failed for user postgres" because the file was missing.

**How to apply:** Always tell the user to create `.env` at the repo root as part of first-time setup instructions.
