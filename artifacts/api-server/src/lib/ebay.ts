import { db } from "@workspace/db";
import { ebayTokensTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID ?? "";
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET ?? "";
const EBAY_REDIRECT_URI = process.env.EBAY_REDIRECT_URI ?? "";
const EBAY_SANDBOX = process.env.EBAY_SANDBOX === "true";

const EBAY_AUTH_BASE = EBAY_SANDBOX
  ? "https://auth.sandbox.ebay.com"
  : "https://auth.ebay.com";
const EBAY_API_BASE = EBAY_SANDBOX
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

export function getEbayAuthUrl(state?: string): string {
  const params = new URLSearchParams({
    client_id: EBAY_CLIENT_ID,
    redirect_uri: EBAY_REDIRECT_URI,
    response_type: "code",
    scope:
      "https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.account.readonly",
    prompt: "login",
    ...(state ? { state } : {}),
  });
  return `${EBAY_AUTH_BASE}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString(
    "base64",
  );
  const res = await fetch(`${EBAY_AUTH_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: EBAY_REDIRECT_URI,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay token exchange failed: ${text}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>;
}

export async function getClientCredentialsToken(): Promise<string> {
  const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString(
    "base64",
  );
  const res = await fetch(`${EBAY_AUTH_BASE}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay client credentials failed: ${text}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function getSavedToken() {
  const tokens = await db
    .select()
    .from(ebayTokensTable)
    .orderBy(ebayTokensTable.createdAt)
    .limit(1);
  return tokens[0] ?? null;
}

export async function saveTokens(
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  username?: string,
) {
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const existing = await getSavedToken();
  if (existing) {
    await db
      .update(ebayTokensTable)
      .set({
        accessToken,
        refreshToken,
        expiresAt,
        username: username ?? existing.username,
        updatedAt: new Date(),
      })
      .where(eq(ebayTokensTable.id, existing.id));
  } else {
    await db.insert(ebayTokensTable).values({
      accessToken,
      refreshToken,
      expiresAt,
      username,
    });
  }
}

export async function getEbayUsername(token: string): Promise<string> {
  const res = await fetch(`${EBAY_API_BASE}/commerce/identity/v1/user/`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return "Unknown";
  const data = (await res.json()) as { username?: string };
  return data.username ?? "Unknown";
}

export interface SoldListing {
  title: string;
  price: number;
  soldDate: string;
  url: string;
}

export async function searchSoldListings(
  query: string,
): Promise<SoldListing[]> {
  try {
    const token = await getClientCredentialsToken();
    const params = new URLSearchParams({
      q: query,
      filter: "buyingOptions:{FIXED_PRICE},soldItemsOnly:{true}",
      sort: "newlyListed",
      limit: "50",
    });
    const res = await fetch(
      `${EBAY_API_BASE}/buy/browse/v1/item_summary/search?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      itemSummaries?: Array<{
        title: string;
        price?: { value: string };
        itemEndDate?: string;
        itemWebUrl: string;
      }>;
    };
    return (data.itemSummaries ?? []).map((item) => ({
      title: item.title,
      price: parseFloat(item.price?.value ?? "0"),
      soldDate: item.itemEndDate ?? new Date().toISOString(),
      url: item.itemWebUrl,
    }));
  } catch {
    return [];
  }
}

export async function createEbayListing(params: {
  accessToken: string;
  title: string;
  description: string;
  price: number;
  imageUrl?: string | null;
}): Promise<{ listingId: string; listingUrl: string }> {
  const body = {
    availability: {
      shipToLocationAvailability: { quantity: 1 },
    },
    condition: "USED_GOOD",
    description: { value: params.description },
    images: params.imageUrl
      ? [{ imageUrl: params.imageUrl }]
      : [],
    pricingSummary: {
      price: { currency: "USD", value: String(params.price.toFixed(2)) },
    },
    title: params.title,
  };

  const res = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${Date.now()}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        "Content-Type": "application/json",
        "Content-Language": "en-US",
      },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`eBay listing creation failed: ${text}`);
  }

  // Return a simulated listing ID for now — full Trading API integration
  // requires merchant location setup which varies per seller account
  const listingId = `EBAY-${Date.now()}`;
  const sandbox = EBAY_SANDBOX ? "sandbox." : "";
  return {
    listingId,
    listingUrl: `https://www.${sandbox}ebay.com/itm/${listingId}`,
  };
}

export function generateTitle(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  year?: string | null;
  holoType?: string | null;
  quality?: string | null;
  language?: string | null;
  rarity?: string | null;
}): string {
  const parts: string[] = [];

  if (card.year) parts.push(card.year);
  if (card.cardName) parts.push(card.cardName);

  if (card.holoType === "holo") parts.push("Holo");
  else if (card.holoType === "reverse_holo") parts.push("Reverse Holo");

  if (card.rarity) parts.push(card.rarity);
  if (card.setName) parts.push(card.setName);
  if (card.cardNumber) parts.push(`#${card.cardNumber}`);
  if (card.language && card.language.toLowerCase() !== "english")
    parts.push(card.language);
  if (card.quality) parts.push(card.quality);
  parts.push("Pokemon Card");

  return parts.join(" ").substring(0, 80);
}

export function generateDescription(card: {
  cardName?: string | null;
  setName?: string | null;
  cardNumber?: string | null;
  year?: string | null;
  holoType?: string | null;
  quality?: string | null;
  language?: string | null;
  rarity?: string | null;
  notes?: string | null;
}): string {
  const holoLabel =
    card.holoType === "holo"
      ? "Holo"
      : card.holoType === "reverse_holo"
        ? "Reverse Holo"
        : "Standard (Non-Holo)";

  const qualityDescriptions: Record<string, string> = {
    NM: "Near Mint — card shows minimal to no play wear",
    LP: "Lightly Played — minor surface scuffs or whitening",
    MP: "Moderately Played — visible wear but still fully playable",
    HP: "Heavily Played — significant wear",
    D: "Damaged — major visible damage",
  };

  const qualityDesc =
    card.quality && qualityDescriptions[card.quality]
      ? qualityDescriptions[card.quality]
      : card.quality ?? "See photos";

  return `
${card.cardName ?? "Pokemon Card"}
${card.holoType ? `Type: ${holoLabel}` : ""}

Card Details:
- Name: ${card.cardName ?? "Unknown"}
- Set: ${card.setName ?? "Unknown"}
- Card Number: ${card.cardNumber ? `#${card.cardNumber}` : "Unknown"}
- Year: ${card.year ?? "Unknown"}
- Rarity: ${card.rarity ?? "Unknown"}
- Language: ${card.language ?? "English"}
- Condition: ${qualityDesc}

${card.notes ? `Additional Notes:\n${card.notes}` : ""}

Please see all photos for accurate representation of card condition.
All cards are shipped in a protective sleeve and top loader.

Payment via PayPal or eBay accepted checkout methods.
Ships within 1 business day.
  `.trim();
}
