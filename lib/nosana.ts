import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { NOSANA_SYSTEM_PROMPT } from "./prompts";
import { reviewSchema, type BacktestResult, type RobustnessReview } from "./result-schema";
import type { StrategyDefinition } from "./strategy-schema";
import { envFlag, extractJsonObject, stripThinking } from "./utils";

const nosana = new OpenAI({
  apiKey: process.env.NOSANA_API_KEY ?? "missing",
  baseURL: process.env.NOSANA_BASE_URL ?? "https://inference.nosana.com/v1",
  timeout: 60_000,
  maxRetries: 1,
});

let cachedModel: string | null = null;

// vLLM extensions: skip Qwen3-style thinking (it eats the token budget) and force a JSON object.
const REVIEW_PARAMS = {
  max_tokens: 2000,
  response_format: { type: "json_object" },
  chat_template_kwargs: { enable_thinking: false },
} as const;

type CreateParams = OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming;
const complete = (params: Omit<CreateParams, "max_tokens">) =>
  nosana.chat.completions.create({ ...REVIEW_PARAMS, ...params } as CreateParams);

/** Served Nosana models change with available GPUs, so discover one unless pinned. */
export async function resolveNosanaModel(): Promise<string> {
  if (process.env.NOSANA_MODEL) return process.env.NOSANA_MODEL;
  if (cachedModel) return cachedModel;
  const list = await nosana.models.list();
  const ids = list.data
    .filter((m) => (m as unknown as { available?: boolean }).available !== false)
    .map((m) => m.id);
  if (ids.length === 0) throw new Error("Nosana returned no models");
  const preferred = ids.find((id) => /instruct|chat|qwen|llama|mistral|gpt-oss/i.test(id) && !/embed/i.test(id));
  cachedModel = preferred ?? ids[0];
  return cachedModel;
}

function reviewInput(strategy: StrategyDefinition, backtest: BacktestResult) {
  return JSON.stringify(
    {
      strategy,
      dataset: backtest.meta,
      performance: backtest.performance,
      segments: backtest.segments,
      recentTrades: backtest.trades.slice(-15),
    },
    null,
    2,
  );
}

function parseReview(raw: string): RobustnessReview | null {
  try {
    const parsed = reviewSchema.safeParse(extractJsonObject(stripThinking(raw)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export type ReviewOutcome = { review: RobustnessReview; model: string };

/** Returns null (never throws) so a review failure cannot discard a valid backtest. */
export async function reviewBacktest(
  strategy: StrategyDefinition,
  backtest: BacktestResult,
): Promise<ReviewOutcome | null> {
  if (envFlag("MOCK_NOSANA")) {
    return {
      model: "mock",
      review: {
        summary: "Mock review: the sample is large enough to be informative, but returns are unstable across segments.",
        strengths: [`${backtest.performance.trades} trades gives a usable initial sample.`],
        warnings: [{ severity: "medium", title: "Segment instability", detail: "Returns vary materially between dataset thirds." }],
        nextTests: ["Repeat with a higher spread assumption.", "Test adjacent indicator periods."],
      },
    };
  }

  try {
    const model = await resolveNosanaModel();
    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: NOSANA_SYSTEM_PROMPT },
      { role: "user", content: reviewInput(strategy, backtest) },
    ];
    const first = await complete({ model, messages, temperature: 0.2 });
    const firstText = first.choices[0]?.message?.content ?? "";
    const review = parseReview(firstText);
    if (review) return { review, model };

    const second = await complete({
      model,
      temperature: 0,
      messages: [
        ...messages,
        { role: "assistant", content: firstText },
        { role: "user", content: "That was not valid JSON in the required shape. Return only the JSON object." },
      ],
    });
    const repaired = parseReview(second.choices[0]?.message?.content ?? "");
    return repaired ? { review: repaired, model } : null;
  } catch (e) {
    console.error("[nosana] review failed:", (e as Error).message);
    return null;
  }
}
