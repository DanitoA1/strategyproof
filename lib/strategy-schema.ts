import { z } from "zod";

const indicatorOperand = z
  .object({
    kind: z.literal("indicator"),
    indicator: z.enum(["rsi", "ema", "sma"]),
    period: z.number().int().min(2).max(500),
    source: z.literal("close"),
  })
  .refine((o) => o.indicator !== "rsi" || o.period <= 100, {
    message: "RSI period must be between 2 and 100",
    path: ["period"],
  });

const priceOperand = z.object({
  kind: z.literal("price"),
  source: z.enum(["open", "high", "low", "close"]),
});

const constantOperand = z.object({
  kind: z.literal("constant"),
  value: z.number().finite(),
});

export const operandSchema = z.union([indicatorOperand, priceOperand, constantOperand]);

export const conditionSchema = z.object({
  left: operandSchema,
  operator: z.enum(["gt", "lt", "gte", "lte", "cross_above", "cross_below"]),
  right: operandSchema,
});

export const strategySchema = z.object({
  version: z.literal("1.0"),
  name: z.string().min(1).max(80),
  market: z.object({
    symbol: z.literal("EURUSD"),
    timeframe: z.literal("15m"),
  }),
  direction: z.enum(["long", "short"]),
  entry: z.object({
    mode: z.literal("all"),
    conditions: z.array(conditionSchema).min(1).max(5),
  }),
  risk: z.object({
    stopLossPips: z.number().min(1).max(500),
    takeProfitPips: z.number().min(1).max(1000),
    riskPerTradePct: z.number().min(0.1).max(5),
  }),
  costs: z.object({
    spreadPips: z.number().min(0).max(10),
  }),
});

export type Operand = z.infer<typeof operandSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type StrategyDefinition = z.infer<typeof strategySchema>;

/** What Kimi returns when an idea cannot be expressed in the DSL. */
export const unsupportedSchema = z.object({
  unsupported: z.literal(true),
  reason: z.string(),
});

const OPERATOR_TEXT: Record<Condition["operator"], string> = {
  gt: "is above",
  lt: "is below",
  gte: "is at or above",
  lte: "is at or below",
  cross_above: "crosses above",
  cross_below: "crosses below",
};

export function describeOperand(o: Operand): string {
  if (o.kind === "constant") return String(o.value);
  if (o.kind === "price") return `${o.source[0].toUpperCase()}${o.source.slice(1)} price`;
  return `${o.indicator.toUpperCase()}(${o.period})`;
}

export function describeCondition(c: Condition): string {
  return `${describeOperand(c.left)} ${OPERATOR_TEXT[c.operator]} ${describeOperand(c.right)}`;
}
