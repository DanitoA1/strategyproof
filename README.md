# StrategyProof

**Don't trust a trading strategy. Test it.**

Built at Daytona HackSprint Seoul (September 19, 2026) as a standalone FXToolkit prototype.

StrategyProof asks a simple question:

Can we replace "trust this trading strategy" with "show me the evidence"?

A trader describes a strategy in plain English.

Kimi converts the idea into deterministic trading rules.

StrategyProof launches an isolated Daytona sandbox, loads historical EURUSD
market data and executes the strategy.

The sandbox returns quantitative evidence including returns, drawdown,
trade count and profit factor, then it is destroyed.

Finally, an independent open model running through Nosana reviews the
evidence and identifies weaknesses such as small sample size, unstable
performance, cost sensitivity and possible overfitting.

StrategyProof does not tell traders what to trade.

It gives them a faster way to test claims.

---

## How it works

```text
Natural-language idea
  → Kimi (moonshotai/kimi-k2.5) → constrained Strategy DSL (JSON), validated with Zod
  → Daytona: create sandbox → upload backtest.py + strategy.json + eurusd_15m.csv
             → run fixed python3 command → parse JSON metrics → destroy sandbox
  → Nosana (open model, discovered via GET /models) → independent robustness critique
  → Streaming NDJSON → live agent timeline + results dashboard
```

The LLM never writes executable code. Kimi only emits a small JSON DSL (RSI / EMA / SMA
operands, six comparison/cross operators, fixed SL/TP, risk %, spread) that is validated before
anything runs. The sandbox then runs our own deterministic, standard-library-only engine.

## Sponsor integrations (code level)

| Sponsor | Where | What it does |
| --- | --- | --- |
| **Daytona** | [`lib/daytona.ts`](lib/daytona.ts) | `@daytona/sdk`: `daytona.create({ language: "python", ephemeral: true })`, `sandbox.fs.uploadFiles`, `sandbox.process.executeCommand` (60 s timeout), `sandbox.delete(60, true)` in `finally`. One fresh sandbox per request. |
| **Nosana** | [`lib/nosana.ts`](lib/nosana.ts) | OpenAI-compatible client against `https://inference.nosana.com/v1`, model auto-discovery via `/models` (cached), JSON-mode review with one repair attempt. Review failure never discards a valid backtest. |
| Kimi (Moonshot) | [`lib/kimi.ts`](lib/kimi.ts) | Kimi K2.5 via an OpenAI-compatible endpoint (OpenRouter during the event, since Kimi had no event credits; set `KIMI_BASE_URL=https://api.moonshot.ai/v1` to go direct). One repair request at most. Unsupported ideas are rejected rather than reinterpreted. |

Streaming endpoint: [`app/api/backtest/route.ts`](app/api/backtest/route.ts) (`POST /api/backtest`, `application/x-ndjson`).

## Backtest engine

[`engine/backtest.py`](engine/backtest.py) uses only the Python standard library, so there's nothing to install inside the sandbox.

- Indicators: SMA, EMA (SMA-seeded), RSI (Wilder smoothing), `None` during warmup
- `cross_above`: `prev_left <= prev_right AND left > right` (and the mirror for `cross_below`)
- Signals are evaluated on candle close and filled at the **next candle's open**
- SL/TP are checked against candle high/low; **stop loss wins** if both touch in the same candle; gaps through SL fill at the open
- One position at a time; the last open trade closes at the final close
- $10,000 start, fixed % risk of current equity, spread deducted from every trade (1 pip = 0.0001)
- Output: one JSON document on stdout (meta, performance, dataset-third segments, equity curve, trades)

## Data

`data/eurusd_15m.csv`: **48,856 real EURUSD 15-minute candles** (2024-01-01 → 2025-12-31, bid) from
Dukascopy via `npx dukascopy-node -i eurusd -from 2024-01-01 -to 2026-01-01 -t m15 -f csv -v`,
with timestamps converted to ISO-8601. It's validated for ascending timestamps and OHLC consistency. It's kept
server-side (not in `/public`) and uploaded into each sandbox.

## Run it

```bash
pnpm install
cp .env.example .env.local   # fill DAYTONA_API_KEY, KIMI_API_KEY, NOSANA_API_KEY
pnpm dev                     # http://localhost:3000
```

Useful scripts:

```bash
pnpm test             # DSL validation + engine determinism / SL-first tie rule
pnpm smoke:daytona    # create → upload → execute → destroy a real sandbox
pnpm smoke:kimi       # parse the three presets + an unsupported idea
pnpm smoke:nosana     # review a local backtest with the Nosana model
pnpm sandboxes        # list any Daytona sandboxes still alive (should be 0)
python3 engine/backtest.py --strategy engine/examples/rsi-oversold-recovery.json --data data/eurusd_15m.csv
```

Development-only flags: `MOCK_KIMI=true`, `MOCK_NOSANA=true`. There's deliberately no Daytona mock.

## Security

- API keys are only read server-side (`runtime = "nodejs"` route); the browser never sees them.
- User text never reaches a shell: the sandbox command is a fixed string, and the strategy is uploaded as a JSON file.
- The DSL can't carry code (Zod rejects unknown operand kinds and indicators).
- Ideas are capped at 2,000 characters, execution has a 60 s timeout, and every sandbox is deleted in `finally` (and created `ephemeral` as a backstop).

## Demo strategy

> Buy EURUSD on the 15-minute chart when RSI 14 crosses back above 30.
> Use a 20 pip stop loss and 40 pip take profit. Risk 1% per trade.

On the bundled data this produces **395 trades**, 34.4% win rate, PF 0.96, −9.8% net and −27.8% max drawdown:
a believable, mixed result. Nothing is tuned to look profitable.

---

Historical simulation only. Past performance does not predict future results. Not financial advice.
