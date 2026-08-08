/**
 * Pricing via the Pokemon TCG API (pokemontcg.io).
 * Returns TCGPlayer market prices — no eBay developer account needed.
 * Works without an API key (60 req/min) or with one (unlimited, free at pokemontcg.io).
 */

const BASE_URL = "https://api.pokemontcg.io/v2";

interface TcgPriceEntry {
  low: number | null;
  mid: number | null;
  market: number | null;
  directLow: number | null;
}

interface TcgCard {
  id: string;
  name: string;
  number?: string;
  set?: { name: string; total?: number; releaseDate?: string };
  tcgplayer?: {
    prices?: {
      holofoil?: TcgPriceEntry;
      reverseHolofoil?: TcgPriceEntry;
      normal?: TcgPriceEntry;
      "1stEditionNormal"?: TcgPriceEntry;
      "1stEditionHolofoil"?: TcgPriceEntry;
    };
  };
}

function pickPrice(prices: NonNullable<NonNullable<TcgCard["tcgplayer"]>["prices"]>, holoType: string | null | undefined): number | null {
  if (!prices) return null;

  // Map our holo types to TCGPlayer price buckets (in preference order)
  if (holoType === "holo" || holoType === "cosmo_holo") {
    return (
      prices.holofoil?.market ??
      prices["1stEditionHolofoil"]?.market ??
      prices.holofoil?.mid ??
      null
    );
  }
  if (holoType === "reverse_holo") {
    return (
      prices.reverseHolofoil?.market ??
      prices.reverseHolofoil?.mid ??
      null
    );
  }
  // Standard / unknown
  return (
    prices.normal?.market ??
    prices["1stEditionNormal"]?.market ??
    prices.normal?.mid ??
    prices.holofoil?.market ?? // fallback for misidentified holos
    null
  );
}

/** Strip set code prefix from card names like "SV06: Twilight Masquerade Sandslash" → "Sandslash" */
function cleanCardName(name: string): string {
  return name.replace(/^[A-Z]{1,5}\d{1,3}[a-z]?:\s+\S+\s+\S+\s+/, "").trim();
}

/** Strip set code from set names like "SV06: Twilight Masquerade" → "Twilight Masquerade" */
function cleanSetName(name: string): string {
  return name.replace(/^[A-Z]{1,5}\d{1,3}[a-z]?:\s+/, "").trim();
}

/** Remove characters that break pokemontcg.io's Lucene query parser.
 *  Apostrophes are intentionally kept — the API stores names like "Team Rocket's Orbeetle" with them.
 *  The & character (e.g. "Scarlet & Violet") is the main offender and must be removed. */
function sanitizeQueryTerm(term: string): string {
  return term.replace(/["""]/g, "").replace(/[&+!(){}\[\]^~*?:\\/]/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchTcgMarketPrice(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  holoType?: string | null;
}): Promise<{ marketPrice: number | null; matchedCardName: string | null; matchedSetName: string | null; matchedYear: string | null; source: string }> {
  try {
    // Clean names in case the DB still has the old set-prefixed format
    const cardName = card.cardName ? cleanCardName(card.cardName) : null;
    const setName = card.setName ? cleanSetName(card.setName) : null;

    // Build query parts — sanitize names to avoid breaking the Lucene parser.
    // Do NOT use set.name (& in names like "Scarlet & Violet" breaks Lucene).
    // Do NOT use set.total (multiple sets share the same total, causing wrong matches).
    // name + number is specific enough: card names are unique per Pokémon per number.
    let numStr: string | null = null;
    if (card.cardNumber) {
      const [num] = card.cardNumber.split("/");
      numStr = String(parseInt(num.trim(), 10)); // strip leading zeros (062 → 62)
    }

    if (!numStr && !cardName) return { marketPrice: null, matchedCardName: null, matchedSetName: null, matchedYear: null, source: "no search terms" };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.POKEMON_TCG_API_KEY) {
      headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
    }

    const tryQuery = async (query: string) => {
      const url = `${BASE_URL}/cards?q=${encodeURIComponent(query)}&pageSize=10&select=id,name,number,set,tcgplayer`;
      console.log(`[pokemonPricing] query: ${query}`);
      const res = await fetch(url, { headers });
      if (!res.ok) { console.log(`[pokemonPricing] API error ${res.status} for: ${query}`); return null; }
      const data = (await res.json()) as { data: TcgCard[] };
      if (!data.data?.length) { console.log(`[pokemonPricing] no results for: ${query}`); return null; }
      return data.data;
    };

    // Use name+number only — name-only fallback risks matching a card from the wrong set
    // (e.g. "Pikachu" name-only returns Base Set instead of Destined Rivals)
    const safeCardName = cardName ? sanitizeQueryTerm(cardName) : null;
    const nameAndNumber = safeCardName && numStr ? `name:"${safeCardName}" number:"${numStr}"` : null;

    let results = nameAndNumber ? await tryQuery(nameAndNumber) : null;

    if (!results?.length) {
      return { marketPrice: null, matchedCardName: null, matchedSetName: null, matchedYear: null, source: "no results" };
    }

    // When multiple results, prefer the one whose set name matches AI's identification
    if (results.length > 1 && setName) {
      const cleaned = cleanSetName(setName).toLowerCase();
      const preferred = results.find(r => r.set?.name?.toLowerCase().includes(cleaned) || cleaned.includes(r.set?.name?.toLowerCase() ?? "___"));
      if (preferred) results = [preferred, ...results.filter(r => r !== preferred)];
    }

    // Use the first result — most specific query wins
    const match = results[0];
    const price = match.tcgplayer?.prices ? pickPrice(match.tcgplayer.prices, card.holoType) : null;
    // Extract year from releaseDate (format: "YYYY/MM/DD")
    const matchedYear = match.set?.releaseDate ? match.set.releaseDate.split("/")[0] : null;
    console.log(`[pokemonPricing] matched: ${match.name} | ${match.set?.name} | ${match.set?.releaseDate} | price: ${price}`);
    return {
      marketPrice: price,
      matchedCardName: match.name ?? null,
      matchedSetName: match.set?.name ?? null,
      matchedYear,
      source: `TCGPlayer (${match.name} ${match.set?.name ?? ""})`,
    };
  } catch (err) {
    console.log(`[pokemonPricing] fetch failed:`, err);
    return { marketPrice: null, matchedCardName: null, matchedSetName: null, matchedYear: null, source: "fetch failed" };
  }
}
