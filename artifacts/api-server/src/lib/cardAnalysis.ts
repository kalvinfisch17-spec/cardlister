import { openai } from "@workspace/integrations-openai-ai-server";

export interface CardAnalysisData {
  cardName: string | null;
  setName: string | null;
  cardNumber: string | null;
  year: string | null;
  quality: string | null;
  holoType: "standard" | "holo" | "reverse_holo" | null;
  language: string | null;
  rarity: string | null;
  confidence: number;
}

export async function analyzeCardImage(
  imageBase64: string,
): Promise<CardAnalysisData> {
  const systemPrompt = `You are an expert Pokemon card identifier with decades of experience grading and cataloging cards. 
Analyze the provided card image and extract all available information.

For holoType, determine:
- "holo" = the card art/illustration has a foil/holographic pattern
- "reverse_holo" = the card border/background has a foil pattern but the art does NOT
- "standard" = no foil/holographic elements visible

For quality, use standard grading:
- "NM" = Near Mint: minimal to no play wear, edges sharp, surface clean
- "LP" = Lightly Played: minor surface scuffs, slight edge whitening
- "MP" = Moderately Played: visible scratches, edge wear
- "HP" = Heavily Played: significant wear throughout
- "D" = Damaged: creases, tears, major damage

Respond ONLY with valid JSON. No markdown, no explanation.`;

  const userPrompt = `Analyze this Pokemon card image and return a JSON object with these exact fields:
{
  "cardName": "full card name as printed",
  "setName": "set/expansion name",
  "cardNumber": "number as printed (e.g. 25/102)",
  "year": "year printed on card",
  "quality": "NM|LP|MP|HP|D",
  "holoType": "standard|holo|reverse_holo",
  "language": "English|Japanese|etc",
  "rarity": "Common|Uncommon|Rare|Holo Rare|Ultra Rare|etc",
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
