import { openai } from "@workspace/integrations-openai-ai-server";

export interface CardAnalysisData {
  cardName: string | null;
  setName: string | null;
  cardNumber: string | null;
  year: string | null;
  quality: string | null;
  holoType: "standard" | "holo" | "reverse_holo" | "cosmo_holo" | null;
  language: string | null;
  rarity: string | null;
  confidence: number;
}

export async function analyzeCardImage(
  imageBase64: string,
): Promise<CardAnalysisData> {
  const systemPrompt = `You are an expert Pokemon card identifier with decades of experience grading and cataloging cards.
Analyze the provided card image and extract all available information.

HOLO TYPE — look carefully at where foil/shimmer appears on the card surface:
- "holo" = ONLY the illustration/art box has a rainbow holographic pattern (shifts colors at different angles). The card frame, borders, and text areas are flat/matte with NO shimmer.
- "reverse_holo" = The card frame, borders, and background areas OUTSIDE the art box have a sparkly or holographic texture. The art box itself is flat/matte (NOT foil). Very common in sets from 2003 onward. Look for shimmer in the border/frame area.
- "cosmo_holo" = Tiny star-like sparkles scattered across the ENTIRE card face including the art — looks like a star field or cosmos. Common on blister promotional cards (McDonald's promos, blister pack exclusives). Distinct from holo because the stars appear over the whole card, not just the art.
- "standard" = Completely flat and matte everywhere. No shimmer, sparkle, or rainbow effect on any part of the card.
Key rule: ask yourself WHERE the foil is — art box only → holo; outside the art box → reverse_holo; star sparkles over everything → cosmo_holo; nowhere → standard.

QUALITY — standard grading:
- "NM" = Near Mint: minimal to no play wear, edges sharp, surface clean
- "LP" = Lightly Played: minor surface scuffs, slight edge whitening
- "MP" = Moderately Played: visible scratches, edge wear
- "HP" = Heavily Played: significant wear throughout
- "D" = Damaged: creases, tears, major damage

LANGUAGE — determined by the printed text (card name, flavor text, move names), NOT the artwork:
- If the card name and text are in English, language = "English"
- If in Japanese characters, language = "Japanese"
- Always return the set name in the SAME language as the card text. English cards must have English set names.

Respond ONLY with valid JSON. No markdown, no explanation.`;

  const userPrompt = `Analyze this Pokemon card image and return a JSON object with these exact fields:
{
  "cardName": "full card name as printed on the card",
  "setName": "English set/expansion name — use the English name even if you recognize the set (e.g. 'Base Set', 'Scarlet & Violet', 'Twilight Masquerade'). Return null if you cannot identify it.",
  "cardNumber": "number as printed including total (e.g. 25/102)",
  "year": "the RIGHTMOST year in the copyright line at the bottom of the card (e.g. from '© 1995-2016 Nintendo' return '2016')",
  "quality": "NM|LP|MP|HP|D",
  "holoType": "standard|holo|reverse_holo|cosmo_holo",
  "language": "English|Japanese|Korean|etc",
  "rarity": "Common|Uncommon|Rare|Holo Rare|Ultra Rare|Secret Rare|etc",
  "confidence": 0.0-1.0
}

Use null for any field you cannot determine with confidence.`;

  try {
    // Detect image type from base64 prefix or default to jpeg
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
      "image/jpeg";
    if (imageBase64.startsWith("data:image/png")) mediaType = "image/png";
    else if (imageBase64.startsWith("data:image/webp")) mediaType = "image/webp";
    else if (imageBase64.startsWith("data:image/gif")) mediaType = "image/gif";

    // Strip data URL prefix if present
    const base64Data = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    const model = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
      ? "gpt-5.6-luna"   // Replit proxy — use internal model name
      : "gpt-4o";        // Standard OpenAI key — use real model name

    const response = await openai.chat.completions.create({
      model,
      max_completion_tokens: 512,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Data}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    // Strip any accidental markdown fencing
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(cleaned) as CardAnalysisData;
    return {
      cardName: parsed.cardName ?? null,
      setName: parsed.setName ?? null,
      cardNumber: parsed.cardNumber ?? null,
      year: parsed.year ?? null,
      quality: parsed.quality ?? null,
      holoType: parsed.holoType ?? null,
      language: parsed.language ?? null,
      rarity: parsed.rarity ?? null,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
    };
  } catch (err) {
    console.error("[cardAnalysis] AI call failed:", err);
    return {
      cardName: null,
      setName: null,
      cardNumber: null,
      year: null,
      quality: null,
      holoType: null,
      language: null,
      rarity: null,
      confidence: 0,
    };
  }
}
