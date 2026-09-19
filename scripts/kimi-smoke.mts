import { parseStrategy } from "@/lib/kimi";
import { describeCondition } from "@/lib/strategy-schema";

const ideas = [
  "Buy EURUSD when RSI 14 crosses back above 30. Stop loss 20 pips. Take profit 40 pips.",
  "Buy EURUSD when EMA 20 crosses above EMA 50. Stop loss 25 pips. Take profit 50 pips.",
  "Sell EURUSD when RSI 14 crosses below 70. Stop loss 20 pips. Take profit 30 pips.",
  "Trade a liquidity sweep into a fair-value gap during London session with 15 pip stop and 45 pip target.",
];

for (const idea of ideas) {
  const t = Date.now();
  try {
    const { strategy, repaired } = await parseStrategy(idea);
    console.log(`OK ${Date.now() - t}ms repaired=${repaired}`, strategy.name, strategy.direction,
      strategy.entry.conditions.map(describeCondition), strategy.risk, strategy.costs);
  } catch (e) {
    console.log(`ERR ${Date.now() - t}ms`, (e as Error).message);
  }
}
