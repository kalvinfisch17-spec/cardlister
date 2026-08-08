---
name: pokemontcg.io query rules
description: Hard-won rules for querying the pokemontcg.io API reliably in the card analysis pipeline
---

# pokemontcg.io Query Rules

**Why:** Extensive debugging revealed several non-obvious API quirks that cause 500 errors and wrong matches.

## What works
- `name:"Team Rocket's Orbeetle" number:"89"` — apostrophes are FINE in quoted strings; the API stores names WITH apostrophes
- Card names + number is specific enough to find the right card without set disambiguation
- `POKEMON_TCG_API_KEY` env var is already wired up — free key at pokemontcg.io removes 60 req/min limit

## What breaks
- `set.name:"Scarlet & Violet"` — the `&` is a Lucene operator, causes 500 even inside quotes; never use set.name in queries
- `set.total:182` — multiple sets share the same total (e.g. Aquapolis AND Paradox Rift AND Destined Rivals all have printedTotal 182); causes wrong matches
- Stripping apostrophes from names — "Team Rockets Orbeetle" finds nothing; API needs "Team Rocket's Orbeetle"

## Sanitization rule
Strip only: `"`, `"`, `"`, `&`, `+`, `!`, `(`, `)`, `{`, `}`, `[`, `]`, `^`, `~`, `*`, `?`, `:`, `\`, `/`  
Keep: apostrophes `'`

## Retry behavior
5xx errors are transient — one retry after 600ms resolves most cases. Implemented in `tryQuery()`.

## TCGPlayer priority
`matchedSetName` and `matchedYear` from pokemontcg.io ALWAYS override AI values — AI frequently returns wrong set names (reads series branding instead of expansion name).

**How to apply:** Any change to `fetchTcgMarketPrice` in `artifacts/api-server/src/lib/pokemonPricing.ts` must respect these rules.
