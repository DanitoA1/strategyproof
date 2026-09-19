import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { reviewBacktest } from "@/lib/nosana";
import { backtestResultSchema } from "@/lib/result-schema";
import { strategySchema } from "@/lib/strategy-schema";

const file = "engine/examples/rsi-oversold-recovery.json";
const strategy = strategySchema.parse(JSON.parse(readFileSync(file, "utf8")));
const out = execFileSync("python3", ["engine/backtest.py", "--strategy", file, "--data", "data/eurusd_15m.csv"], { stdio: ["ignore", "pipe", "ignore"] });
const backtest = backtestResultSchema.parse(JSON.parse(out.toString()));
const t = Date.now();
const r = await reviewBacktest(strategy, backtest);
console.log(`${Date.now() - t}ms`, JSON.stringify(r, null, 2));
