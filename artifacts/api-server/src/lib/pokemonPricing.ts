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
  set?: { name: string };
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
  if (holoType === "holo") {
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

export async function fetchTcgMarketPrice(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  holoType?: string | null;
}): Promise<{ marketPrice: number | null; matchedCardName: string | null; matchedSetName: string | null; source: string }> {
  try {
    // Clean names in case the DB still has the old set-prefixed format
    const cardName = card.cardName ? cleanCardName(card.cardName) : null;
    const setName = card.setName ? cleanSetName(card.setName) : null;

    // Build query — more specific = better match
    const parts: string[] = [];
    if (cardName) parts.push(`name:"${cardName.replace(/"/g, "")}"`);
    if (card.cardNumber) parts.push(`number:"${card.cardNumber.replace(/\/.*/g, "")}"`); // strip "/115" suffix
    if (setName) parts.push(`set.name:"${setName.replace(/"/g, "")}"`);

    if (parts.length === 0) return { marketPrice: null, matchedCardName: null, matchedSetName: null, source: "no search terms" };

    const query = parts.join(" ");
    const url = `${BASE_URL}/cards?q=${encodeURIComponent(query)}&pageSize=5&select=id,name,number,set,tcgplayer`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (process.env.POKEMON_TCG_API_KEY) {
      headers["X-Api-Key"] = process.env.POKEMON_TCG_API_KEY;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) return { marketPrice: null, matchedCardName: null, matchedSetName: null, source: `API error ${res.status}` };

    const data = (await res.json()) as { data: TcgCard[] };
    if (!data.data?.length) return { marketPrice: null, matchedCardName: null, matchedSetName: null, source: "no results" };

    // Use the first result — most specific query wins
    const match = data.data[0];
    const price = match.tcgplayer?.prices ? pickPrice(match.tcgplayer.prices, card.holoType) : null;
    return {
      marketPrice: price,
      matchedCardName: match.name ?? null,
      matchedSetName: match.set?.name ?? null,
      source: `TCGPlayer (${match.name} ${match.set?.name ?? ""})`,
    };
  } catch {
    return { marketPrice: null, matchedCardName: null, matchedSetName: null, source: "fetch failed" };
  }
}
