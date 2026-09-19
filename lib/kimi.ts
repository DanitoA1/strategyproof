import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { KIMI_REPAIR_PROMPT, KIMI_SYSTEM_PROMPT } from "./prompts";
import { strategySchema, unsupportedSchema, type StrategyDefinition } from "./strategy-schema";
import { StageError, envFlag, extractJsonObject, stripThinking } from "./utils";
import demoStrategy from "@/engine/examples/rsi-oversold-recovery.json";

const baseURL = process.env.KIMI_BASE_URL ?? "https://api.moonshot.ai/v1";
const model = process.env.KIMI_MODEL ?? "kimi-k2.5";
const viaOpenRouter = baseURL.includes("openrouter.ai");

const kimi = new OpenAI({
  apiKey: process.env.KIMI_API_KEY ?? "missing",
  baseURL,
  timeout: 45_000,
  maxRetries: 1,
  defaultHeaders: viaOpenRouter
    ? { "HTTP-Referer": "https://strategyproof.dev", "X-Title": "StrategyProof" }
    : undefined,
});

export const KIMI_UNSUPPORTED_MESSAGE =
  "This prototype currently supports RSI, EMA and SMA strategies with a fixed stop loss and take profit.";

export type ParseOutcome = { strategy: StrategyDefinition; model: string; repaired: boolean };

async function complete(messages: ChatCompletionMessageParam[]): Promise<string> {
  const params = {
    model,
    messages,
    temperature: 0,
    max_tokens: 1500,
    // OpenRouter: skip long reasoning traces; the DSL is a direct translation.
    ...(viaOpenRouter ? { reasoning: { enabled: false } } : {}),
  };
  const res = await kimi.chat.completions.create(
    params as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  );
  return stripThinking(res.choices[0]?.message?.content ?? "");
}

function interpret(raw: string): { ok: true; strategy: StrategyDefinition } | { ok: false; errors: string } {
  let json: unknown;
  try {
    json = extractJsonObject(raw);
  } catch (e) {
    return { ok: false, errors: (e as Error).message };
  }
  if (unsupportedSchema.safeParse(json).success) {
    throw new StageError("parsing_strategy", KIMI_UNSUPPORTED_MESSAGE);
  }
  const parsed = strategySchema.safeParse(json);
  if (parsed.success) return { ok: true, strategy: parsed.data };
  return { ok: false, errors: z.prettifyError(parsed.error) };
}

export async function parseStrategy(idea: string): Promise<ParseOutcome> {
  if (envFlag("MOCK_KIMI")) {
    return { strategy: strategySchema.parse(demoStrategy), model: "mock", repaired: false };
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: KIMI_SYSTEM_PROMPT },
    { role: "user", content: idea },
  ];

  const first = await complete(messages);
  const attempt = interpret(first);
  if (attempt.ok) return { strategy: attempt.strategy, model, repaired: false };

  // Exactly one repair request.
  const second = await complete([
    ...messages,
    { role: "assistant", content: first },
    { role: "user", content: KIMI_REPAIR_PROMPT(attempt.errors) },
  ]);
  const retry = interpret(second);
  if (retry.ok) return { strategy: retry.strategy, model, repaired: true };

  console.error("[kimi] invalid DSL after repair:", retry.errors);
  throw new StageError(
    "parsing_strategy",
    "We couldn't convert that strategy into supported rules. For this demo, use RSI, EMA or SMA with a fixed stop loss and take profit.",
  );
}
