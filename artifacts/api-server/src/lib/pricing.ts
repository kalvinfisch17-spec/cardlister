import { searchSoldListings } from "./ebay";

export const EBAY_FVF_RATE = 0.1325;  // 13.25% final value fee
export const EBAY_ORDER_FEE = 0.30;   // per-order fee
export const SHIPPING_COST = 0.78;    // seller's shipping cost
export const MIN_PROFIT = 0.01;       // guaranteed minimum profit

export function buildPricingQuery(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  holoType?: string | null;
}): string {
  const parts: string[] = [];
  if (card.cardName) parts.push(card.cardName);
  if (card.setName) parts.push(card.setName);
  if (card.cardNumber) parts.push(`#${card.cardNumber}`);
  if (card.holoType === "holo") parts.push("holo");
  else if (card.holoType === "reverse_holo") parts.push("reverse holo");
  parts.push("pokemon card");
  return parts.join(" ");
}

export async function fetchSuggestedPrice(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  holoType?: string | null;
}): Promise<{
  suggestedPrice: number | null;
  averagePrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  soldCount: number;
}> {
  const query = buildPricingQuery(card);
  const soldListings = await searchSoldListings(query);
  const prices = soldListings.map((l) => l.price).filter((p) => p > 0);

  if (prices.length === 0) {
    return { suggestedPrice: null, averagePrice: null, lowestPrice: null, highestPrice: null, soldCount: 0 };
  }

  const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);

  // Floor at break-even + min profit so no sale ever loses money
  const breakEven = Math.ceil(
    ((EBAY_ORDER_FEE + SHIPPING_COST + MIN_PROFIT) / (1 - EBAY_FVF_RATE)) * 100,
  ) / 100;
  const suggestedPrice = Math.max(Math.round(averagePrice * 100) / 100, breakEven);

  return { suggestedPrice, averagePrice, lowestPrice, highestPrice, soldCount: prices.length };
}
