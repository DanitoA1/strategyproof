import { readFileSync } from "node:fs";
import { runBacktestInSandbox } from "@/lib/daytona";
import { strategySchema } from "@/lib/strategy-schema";

const strategy = strategySchema.parse(JSON.parse(readFileSync("engine/examples/rsi-oversold-recovery.json", "utf8")));
const t = Date.now();
const { result, sandboxId } = await runBacktestInSandbox(strategy, (e) => console.log(`+${Date.now() - t}ms`, JSON.stringify(e)));
console.log("sandbox", sandboxId, "performance", result.performance, "engine", result.engine);
