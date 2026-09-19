import { z } from "zod";

export const backtestResultSchema = z.object({
  meta: z.object({
    symbol: z.string(),
    timeframe: z.string(),
    start: z.string(),
    end: z.string(),
    candles: z.number(),
    spreadPips: z.number(),
    riskPerTradePct: z.number(),
    pipSize: z.number(),
    fillModel: z.string(),
  }),
  performance: z.object({
    startingEquity: z.number(),
    endingEquity: z.number(),
    netReturnPct: z.number(),
    maxDrawdownPct: z.number(),
    trades: z.number(),
    wins: z.number(),
    losses: z.number(),
    winRatePct: z.number(),
    profitFactor: z.number().nullable(),
    averageR: z.number(),
    totalPips: z.number(),
    exitReasons: z.record(z.string(), z.number()),
  }),
  segments: z.array(
    z.object({
      name: z.string(),
      trades: z.number(),
      returnPct: z.number(),
      winRatePct: z.number(),
    }),
  ),
  equityCurve: z.array(z.object({ time: z.string(), equity: z.number() })),
  trades: z.array(
    z.object({
      entryTime: z.string(),
      exitTime: z.string(),
      direction: z.enum(["long", "short"]),
      entry: z.number(),
      exit: z.number(),
      pips: z.number(),
      rMultiple: z.number(),
      reason: z.string(),
    }),
  ),
  engine: z.object({
    python: z.string(),
    host: z.string(),
    elapsedMs: z.number(),
    generatedAt: z.string(),
  }),
});

export type BacktestResult = z.infer<typeof backtestResultSchema>;

export const reviewSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()).default([]),
  warnings: z
    .array(
      z.object({
        severity: z.enum(["low", "medium", "high"]).catch("medium"),
        title: z.string(),
        detail: z.string(),
      }),
    )
    .default([]),
  nextTests: z.array(z.string()).default([]),
});

export type RobustnessReview = z.infer<typeof reviewSchema>;
