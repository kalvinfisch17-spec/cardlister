---
name: CardLister codegen zod.int() fix
description: Orval v8 generates zod.int() (zod v4 API) but workspace catalog pins zod v3; post-process step required after every codegen run.
---

After running `pnpm --filter @workspace/api-spec run codegen`, the generated `lib/api-zod/src/generated/api.ts` contains `zod.int()` calls which don't exist in zod v3.

**Fix:** Run `sed -i 's/zod\.int()/zod.number().int()/g' lib/api-zod/src/generated/api.ts` then `pnpm -w run typecheck:libs`.

**Why:** Workspace catalog pins `zod: ^3.25.76`. Orval 8.23+ defaults to zod v4-style output for `type: integer` fields. Upgrading zod to v4 would require updating all zod imports across the project (`zod/v4` compat layer vs direct).

**How to apply:** Every time the OpenAPI spec changes and codegen re-runs for this project.
