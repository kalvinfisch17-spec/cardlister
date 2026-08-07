import { fetchTcgMarketPrice } from "./pokemonPricing";

export const EBAY_FVF_RATE = 0.1325;  // 13.25% final value fee
export const EBAY_ORDER_FEE = 0.30;   // per-order fee
export const SHIPPING_COST = 0.78;    // seller's shipping cost
export const MIN_PROFIT = 0.01;       // guaranteed minimum profit

// Break-even floor: the minimum list price that covers all costs + min profit
export const BREAK_EVEN = Math.ceil(
  ((EBAY_ORDER_FEE + SHIPPING_COST + MIN_PROFIT) / (1 - EBAY_FVF_RATE)) * 100,
) / 100;

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

/**
 * Fetch the TCGPlayer market price for a card and apply eBay fees + shipping
 * so the suggested list price nets the seller approximately the market rate.
 *
 * Formula: listPrice = (marketPrice + orderFee + shippingCost + minProfit) / (1 - fvfRate)
 * Floored at BREAK_EVEN so no sale ever loses money.
 */
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
  const { marketPrice } = await fetchTcgMarketPrice(card);

  if (marketPrice === null || marketPrice <= 0) {
    return { suggestedPrice: null, averagePrice: null, lowestPrice: null, highestPrice: null, soldCount: 0 };
  }

  // Apply fees formula
  const rawListPrice = (marketPrice + EBAY_ORDER_FEE + SHIPPING_COST + MIN_PROFIT) / (1 - EBAY_FVF_RATE);
  const suggestedPrice = Math.max(Math.round(rawListPrice * 100) / 100, BREAK_EVEN);

  return {
    suggestedPrice,
    averagePrice: marketPrice,   // TCGPlayer market IS the "average"
    lowestPrice: marketPrice,
    highestPrice: marketPrice,
    soldCount: 1,                // 1 source (TCGPlayer market)
  };
}
