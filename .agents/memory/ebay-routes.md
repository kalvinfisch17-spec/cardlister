---
name: eBay router prefix pattern
description: eBay Express router is mounted with a prefix; individual route handlers must not repeat it.
---

In `artifacts/api-server/src/routes/index.ts`:
```ts
router.use("/ebay", ebayRouter);
```

So inside `artifacts/api-server/src/routes/ebay.ts`, handlers must use paths WITHOUT the `/ebay` prefix:
- `/status` (not `/ebay/status`)
- `/auth-url` (not `/ebay/auth-url`)
- `/callback` (not `/ebay/callback`)
- `/disconnect` (not `/ebay/disconnect`)

**Why:** Express prefix mounting already prepends `/ebay`; repeating it creates `/api/ebay/ebay/...` which 404s silently.
