import OpenAI from "openai";

// In the Replit environment, the AI integration proxy is used.
// For local development, fall back to a plain OPENAI_API_KEY with the standard base URL.
const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ?? "https://api.openai.com/v1";

if (!apiKey) {
  throw new Error(
    "No OpenAI API key found. Set AI_INTEGRATIONS_OPENAI_API_KEY (Replit) or OPENAI_API_KEY (local) in your .env file.",
  );
}

export const openai = new OpenAI({ apiKey, baseURL });
