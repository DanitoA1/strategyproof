import OpenAI from "openai";
import { z } from "zod";
import { VIDEO_SYSTEM_PROMPT } from "./prompts";
import { StageError, extractJsonObject } from "./utils";

// Gemini via OpenRouter reads YouTube links directly (video_url content part).
const video = new OpenAI({
  apiKey: process.env.VIDEO_API_KEY || process.env.KIMI_API_KEY || "missing",
  baseURL: process.env.VIDEO_BASE_URL || "https://openrouter.ai/api/v1",
  timeout: 90_000,
  maxRetries: 0,
  defaultHeaders: { "HTTP-Referer": "https://strategyproof.dev", "X-Title": "StrategyProof" },
});
const model = process.env.VIDEO_MODEL || "google/gemini-3.8-flash";

export const extractionSchema = z.object({
  found: z.boolean(),
  title: z.string().default(""),
  summary: z.string().default(""),
  strategyText: z.string().default(""),
  adaptations: z.array(z.string()).default([]),
  missing: z.array(z.string()).default([]),
});
export type VideoExtraction = z.infer<typeof extractionSchema> & { model: string; elapsedMs: number };

const YOUTUBE = /^https:\/\/(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|live\/)|youtu\.be\/)[\w-]{6,}/;

export function isSupportedVideoUrl(url: string): boolean {
  return YOUTUBE.test(url.trim());
}

export async function extractStrategyFromVideo(url: string): Promise<VideoExtraction> {
  const t0 = Date.now();
  let raw = "";
  try {
    const res = await video.chat.completions.create({
      model,
      temperature: 0,
      max_tokens: 1500,
      messages: [
        { role: "system", content: VIDEO_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract the trading strategy taught in this video." },
            // OpenRouter content part for video; not yet in the OpenAI SDK types.
            { type: "video_url", video_url: { url } } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPartText,
          ],
        },
      ],
    });
    raw = res.choices[0]?.message?.content ?? "";
  } catch (e) {
    console.error("[video] model call failed:", (e as Error).message);
    throw new StageError("extracting_video", "Couldn't analyse that video right now. Try again or paste the strategy as text.");
  }
  try {
    const parsed = extractionSchema.parse(extractJsonObject(raw));
    return { ...parsed, model, elapsedMs: Date.now() - t0 };
  } catch {
    console.error("[video] invalid extraction:", raw.slice(0, 500));
    throw new StageError("extracting_video", "The video was analysed but no clear strategy could be extracted.");
  }
}
