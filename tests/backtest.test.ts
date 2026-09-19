import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { backtestResultSchema } from "@/lib/result-schema";

const ENGINE = "engine/backtest.py";
const run = (strategy: string, data: string) =>
  backtestResultSchema.parse(
    JSON.parse(execFileSync("python3", [ENGINE, "--strategy", strategy, "--data", data], { stdio: ["ignore", "pipe", "ignore"] }).toString()),
  );

describe("backtest engine", () => {
  it("runs the demo strategy on real data with >20 trades, deterministically", () => {
    const a = run("engine/examples/rsi-oversold-recovery.json", "data/eurusd_15m.csv");
    const b = run("engine/examples/rsi-oversold-recovery.json", "data/eurusd_15m.csv");
    expect(a.performance.trades).toBeGreaterThan(20);
    expect(a.performance).toEqual(b.performance);
    expect(a.meta.candles).toBeGreaterThan(40_000);
  });

  it("fills on next open and assumes stop loss first when both levels touch", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "sp-"));
    const rows = ["timestamp,open,high,low,close,volume"];
    const t0 = Date.UTC(2025, 0, 1);
    const ts = (i: number) => new Date(t0 + i * 15 * 60_000).toISOString().replace(".000", "");
    rows.push(`${ts(0)},1.10000,1.10010,1.09990,1.10000,1`); // signal on close (close > 1.0)
    rows.push(`${ts(1)},1.10000,1.20000,1.00000,1.00000,1`); // touches SL and TP
    for (let i = 2; i < 60; i++) rows.push(`${ts(i)},0.90000,0.90010,0.89990,0.90000,1`); // no more signals
    writeFileSync(path.join(dir, "data.csv"), rows.join("\n") + "\n");
    writeFileSync(
      path.join(dir, "s.json"),
      JSON.stringify({
        version: "1.0",
        name: "tie",
        market: { symbol: "EURUSD", timeframe: "15m" },
        direction: "long",
        entry: { mode: "all", conditions: [{ left: { kind: "price", source: "close" }, operator: "gt", right: { kind: "constant", value: 1.0 } }] },
        risk: { stopLossPips: 20, takeProfitPips: 40, riskPerTradePct: 1 },
        costs: { spreadPips: 0 },
      }),
    );
    const r = run(path.join(dir, "s.json"), path.join(dir, "data.csv"));
    expect(r.performance.trades).toBe(1);
    expect(r.trades[0].reason).toBe("stop_loss");
    expect(r.trades[0].entry).toBe(1.1);
    expect(r.trades[0].rMultiple).toBeCloseTo(-1, 5);
    expect(r.performance.endingEquity).toBeCloseTo(9900, 2);
  });
});
