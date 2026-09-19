import { describe, expect, it } from "vitest";
import example from "@/engine/examples/rsi-oversold-recovery.json";
import { describeCondition, strategySchema } from "@/lib/strategy-schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tests mutate arbitrary fields
const clone = () => structuredClone(example) as Record<string, any>;

describe("strategySchema", () => {
  it("accepts the demo strategy", () => {
    const s = strategySchema.parse(example);
    expect(describeCondition(s.entry.conditions[0])).toBe("RSI(14) crosses above 30");
  });

  it("rejects RSI periods above 100", () => {
    const s = clone();
    s.entry.conditions[0].left.period = 150;
    expect(strategySchema.safeParse(s).success).toBe(false);
  });

  it("rejects unsupported indicators", () => {
    const s = clone();
    s.entry.conditions[0].left.indicator = "macd";
    expect(strategySchema.safeParse(s).success).toBe(false);
  });

  it("rejects more than 5 conditions", () => {
    const s = clone();
    s.entry.conditions = Array(6).fill(s.entry.conditions[0]);
    expect(strategySchema.safeParse(s).success).toBe(false);
  });

  it("rejects out-of-range risk and other markets", () => {
    const a = clone();
    a.risk.stopLossPips = 0;
    const b = clone();
    b.risk.riskPerTradePct = 10;
    const c = clone();
    c.market.symbol = "GBPUSD";
    for (const s of [a, b, c]) expect(strategySchema.safeParse(s).success).toBe(false);
  });

  it("rejects code smuggled in as extra operand kinds", () => {
    const s = clone();
    s.entry.conditions[0].right = { kind: "code", value: "__import__('os').system('ls')" };
    expect(strategySchema.safeParse(s).success).toBe(false);
  });
});
