#!/usr/bin/env python3
"""StrategyProof deterministic backtest engine.

Reads a validated StrategyDefinition (JSON) and an OHLC CSV, simulates the
strategy bar by bar and writes exactly one JSON document to stdout.

Standard library only so it runs in a fresh sandbox with no installs.
Diagnostics go to stderr.
"""

import argparse
import csv
import json
import math
import platform
import sys
import time
from datetime import datetime

PIP_SIZE = 0.0001  # EURUSD
STARTING_EQUITY = 10_000.0
MAX_TRADES_IN_OUTPUT = 2000
EQUITY_CURVE_POINTS = 300
OPERATORS = {"gt", "lt", "gte", "lte", "cross_above", "cross_below"}


class EngineError(Exception):
    pass


def log(msg):
    print(msg, file=sys.stderr)


# --------------------------------------------------------------------------
# Data
# --------------------------------------------------------------------------

def load_candles(path):
    ts, o, h, l, c = [], [], [], [], []
    with open(path, newline="") as f:
        reader = csv.DictReader(f)
        prev = None
        for n, row in enumerate(reader, start=2):
            try:
                t = row["timestamp"]
                op, hi, lo, cl = (float(row[k]) for k in ("open", "high", "low", "close"))
            except (KeyError, TypeError, ValueError):
                raise EngineError(f"Missing or invalid OHLC at CSV line {n}")
            if any(math.isnan(v) for v in (op, hi, lo, cl)):
                raise EngineError(f"NaN OHLC at CSV line {n}")
            if hi < max(op, cl) or lo > min(op, cl):
                raise EngineError(f"Inconsistent high/low at CSV line {n}")
            if prev is not None and t <= prev:
                raise EngineError(f"Timestamps not ascending at CSV line {n}")
            prev = t
            ts.append(t)
            o.append(op)
            h.append(hi)
            l.append(lo)
            c.append(cl)
    if len(ts) < 50:
        raise EngineError("Not enough candles in dataset")
    return {"timestamp": ts, "open": o, "high": h, "low": l, "close": c}


# --------------------------------------------------------------------------
# Indicators (None during warmup)
# --------------------------------------------------------------------------

def sma(values, period):
    out = [None] * len(values)
    total = 0.0
    for i, v in enumerate(values):
        total += v
        if i >= period:
            total -= values[i - period]
        if i >= period - 1:
            out[i] = total / period
    return out


def ema(values, period):
    out = [None] * len(values)
    if len(values) < period:
        return out
    alpha = 2.0 / (period + 1)
    prev = sum(values[:period]) / period  # seed with SMA
    out[period - 1] = prev
    for i in range(period, len(values)):
        prev = alpha * values[i] + (1 - alpha) * prev
        out[i] = prev
    return out


def rsi(values, period):
    """RSI with Wilder smoothing."""
    out = [None] * len(values)
    if len(values) <= period:
        return out
    gain = loss = 0.0
    for i in range(1, period + 1):
        d = values[i] - values[i - 1]
        gain += max(d, 0.0)
        loss += max(-d, 0.0)
    avg_gain, avg_loss = gain / period, loss / period

    def value(g, l):
        if l == 0:
            return 100.0 if g > 0 else 50.0
        return 100.0 - 100.0 / (1.0 + g / l)

    out[period] = value(avg_gain, avg_loss)
    for i in range(period + 1, len(values)):
        d = values[i] - values[i - 1]
        avg_gain = (avg_gain * (period - 1) + max(d, 0.0)) / period
        avg_loss = (avg_loss * (period - 1) + max(-d, 0.0)) / period
        out[i] = value(avg_gain, avg_loss)
    return out


def operand_series(operand, candles, cache):
    kind = operand.get("kind")
    if kind == "constant":
        return None  # handled as scalar
    if kind == "price":
        src = operand.get("source")
        if src not in ("open", "high", "low", "close"):
            raise EngineError(f"Unsupported price source: {src}")
        return candles[src]
    if kind == "indicator":
        ind = operand.get("indicator")
        period = int(operand.get("period", 0))
        if operand.get("source", "close") != "close":
            raise EngineError("Indicators only support source=close")
        key = (ind, period)
        if key not in cache:
            if ind == "rsi":
                if not 2 <= period <= 100:
                    raise EngineError("RSI period out of range")
                cache[key] = rsi(candles["close"], period)
            elif ind in ("ema", "sma"):
                if not 2 <= period <= 500:
                    raise EngineError(f"{ind.upper()} period out of range")
                cache[key] = (ema if ind == "ema" else sma)(candles["close"], period)
            else:
                raise EngineError(f"Unsupported indicator: {ind}")
        return cache[key]
    raise EngineError(f"Unsupported operand kind: {kind}")


def build_conditions(strategy, candles):
    cache = {}
    compiled = []
    for cond in strategy["entry"]["conditions"]:
        op = cond.get("operator")
        if op not in OPERATORS:
            raise EngineError(f"Unsupported operator: {op}")
        sides = []
        for side in ("left", "right"):
            operand = cond[side]
            if operand.get("kind") == "constant":
                sides.append(("const", float(operand["value"])))
            else:
                sides.append(("series", operand_series(operand, candles, cache)))
        compiled.append((op, sides[0], sides[1]))
    return compiled


def value_at(side, i):
    kind, data = side
    if kind == "const":
        return data
    if i < 0:
        return None
    return data[i]


def condition_true(cond, i):
    op, left, right = cond
    cl, cr = value_at(left, i), value_at(right, i)
    if cl is None or cr is None:
        return False
    if op == "gt":
        return cl > cr
    if op == "lt":
        return cl < cr
    if op == "gte":
        return cl >= cr
    if op == "lte":
        return cl <= cr
    pl, pr = value_at(left, i - 1), value_at(right, i - 1)
    if pl is None or pr is None:
        return False
    if op == "cross_above":
        return pl <= pr and cl > cr
    if op == "cross_below":
        return pl >= pr and cl < cr
    return False


# --------------------------------------------------------------------------
# Simulation
# --------------------------------------------------------------------------

def validate_strategy(s):
    try:
        if s["market"]["symbol"] != "EURUSD" or s["market"]["timeframe"] != "15m":
            raise EngineError("Only EURUSD 15m is supported")
        if s["direction"] not in ("long", "short"):
            raise EngineError("direction must be long or short")
        conds = s["entry"]["conditions"]
        if not 1 <= len(conds) <= 5:
            raise EngineError("Between 1 and 5 entry conditions required")
        r = s["risk"]
        if not 1 <= r["stopLossPips"] <= 500:
            raise EngineError("stopLossPips out of range")
        if not 1 <= r["takeProfitPips"] <= 1000:
            raise EngineError("takeProfitPips out of range")
        if not 0.1 <= r["riskPerTradePct"] <= 5:
            raise EngineError("riskPerTradePct out of range")
        if not 0 <= s["costs"]["spreadPips"] <= 10:
            raise EngineError("spreadPips out of range")
    except KeyError as e:
        raise EngineError(f"Strategy missing field: {e}")


def simulate(strategy, candles):
    n = len(candles["close"])
    o, h, l, c, ts = (candles[k] for k in ("open", "high", "low", "close", "timestamp"))
    conditions = build_conditions(strategy, candles)
    long_side = strategy["direction"] == "long"
    sign = 1 if long_side else -1
    sl_pips = float(strategy["risk"]["stopLossPips"])
    tp_pips = float(strategy["risk"]["takeProfitPips"])
    risk_pct = float(strategy["risk"]["riskPerTradePct"])
    spread = float(strategy["costs"]["spreadPips"])

    equity = STARTING_EQUITY
    trades = []
    position = None
    pending_entry = False

    def close_trade(i, exit_price, reason):
        nonlocal equity, position
        gross_pips = sign * (exit_price - position["entry"]) / PIP_SIZE
        net_pips = gross_pips - spread
        r_mult = net_pips / sl_pips
        pnl = position["riskDollars"] * r_mult
        equity += pnl
        trades.append({
            "entryIndex": position["index"],
            "entryTime": ts[position["index"]],
            "exitTime": ts[i],
            "direction": strategy["direction"],
            "entry": round(position["entry"], 5),
            "exit": round(exit_price, 5),
            "pips": round(net_pips, 1),
            "rMultiple": round(r_mult, 3),
            "pnl": round(pnl, 2),
            "equityAfter": round(equity, 2),
            "reason": reason,
        })
        position = None

    for i in range(n):
        # 1) Fill the entry signalled on the previous candle's close at this open.
        if pending_entry and position is None:
            entry = o[i]
            position = {
                "index": i,
                "entry": entry,
                "sl": entry - sign * sl_pips * PIP_SIZE,
                "tp": entry + sign * tp_pips * PIP_SIZE,
                "riskDollars": equity * risk_pct / 100.0,
            }
        pending_entry = False

        # 2) Manage the open position using this candle's range.
        if position is not None:
            sl, tp = position["sl"], position["tp"]
            if long_side:
                sl_hit, tp_hit = l[i] <= sl, h[i] >= tp
                gap_sl = o[i] <= sl
            else:
                sl_hit, tp_hit = h[i] >= sl, l[i] <= tp
                gap_sl = o[i] >= sl
            if sl_hit:  # SL wins ties (conservative)
                close_trade(i, o[i] if gap_sl else sl, "stop_loss")
            elif tp_hit:
                close_trade(i, tp, "take_profit")

        # 3) Evaluate entry rules on this candle's close.
        if position is None and i + 1 < n:
            if all(condition_true(cond, i) for cond in conditions):
                pending_entry = True

    if position is not None:
        close_trade(n - 1, c[-1], "end_of_data")

    return trades, equity


def max_drawdown_pct(trades):
    peak = STARTING_EQUITY
    worst = 0.0
    for t in trades:
        eq = t["equityAfter"]
        peak = max(peak, eq)
        worst = max(worst, (peak - eq) / peak * 100.0)
    return worst


def segment_stats(trades, n_candles):
    bounds = [0, n_candles // 3, 2 * n_candles // 3, n_candles]
    names = ["early", "middle", "recent"]
    out = []
    for k, name in enumerate(names):
        seg = [t for t in trades if bounds[k] <= t["entryIndex"] < bounds[k + 1]]
        growth = 1.0
        for t in seg:
            before = t["equityAfter"] - t["pnl"]
            growth *= t["equityAfter"] / before if before else 1.0
        wins = sum(1 for t in seg if t["pnl"] > 0)
        out.append({
            "name": name,
            "trades": len(seg),
            "returnPct": round((growth - 1.0) * 100.0, 2),
            "winRatePct": round(wins / len(seg) * 100.0, 2) if seg else 0.0,
        })
    return out


def equity_curve(trades, first_ts):
    points = [{"time": first_ts, "equity": STARTING_EQUITY}]
    points += [{"time": t["exitTime"], "equity": t["equityAfter"]} for t in trades]
    if len(points) <= EQUITY_CURVE_POINTS:
        return points
    step = (len(points) - 1) / (EQUITY_CURVE_POINTS - 1)
    return [points[round(k * step)] for k in range(EQUITY_CURVE_POINTS)]


def summarize(strategy, candles, trades, equity, started):
    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] <= 0]
    gross_win = sum(t["pnl"] for t in wins)
    gross_loss = -sum(t["pnl"] for t in losses)
    n = len(trades)
    return {
        "meta": {
            "symbol": "EURUSD",
            "timeframe": "15m",
            "start": candles["timestamp"][0],
            "end": candles["timestamp"][-1],
            "candles": len(candles["close"]),
            "spreadPips": strategy["costs"]["spreadPips"],
            "riskPerTradePct": strategy["risk"]["riskPerTradePct"],
            "pipSize": PIP_SIZE,
            "fillModel": "signal on close, fill next open; SL wins same-candle ties",
        },
        "performance": {
            "startingEquity": STARTING_EQUITY,
            "endingEquity": round(equity, 2),
            "netReturnPct": round((equity / STARTING_EQUITY - 1.0) * 100.0, 2),
            "maxDrawdownPct": round(max_drawdown_pct(trades), 2),
            "trades": n,
            "wins": len(wins),
            "losses": len(losses),
            "winRatePct": round(len(wins) / n * 100.0, 2) if n else 0.0,
            "profitFactor": round(gross_win / gross_loss, 3) if gross_loss > 0 else None,
            "averageR": round(sum(t["rMultiple"] for t in trades) / n, 3) if n else 0.0,
            "totalPips": round(sum(t["pips"] for t in trades), 1),
            "exitReasons": {
                r: sum(1 for t in trades if t["reason"] == r)
                for r in ("take_profit", "stop_loss", "end_of_data")
            },
        },
        "segments": segment_stats(trades, len(candles["close"])),
        "equityCurve": equity_curve(trades, candles["timestamp"][0]),
        "trades": [
            {k: v for k, v in t.items() if k not in ("entryIndex", "equityAfter", "pnl")}
            for t in trades[:MAX_TRADES_IN_OUTPUT]
        ],
        "engine": {
            "python": platform.python_version(),
            "host": platform.node(),
            "elapsedMs": round((time.time() - started) * 1000),
            "generatedAt": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    }


def main():
    started = time.time()
    parser = argparse.ArgumentParser(description="StrategyProof backtest engine")
    parser.add_argument("--strategy", required=True)
    parser.add_argument("--data", required=True)
    args = parser.parse_args()
    try:
        with open(args.strategy) as f:
            strategy = json.load(f)
        validate_strategy(strategy)
        candles = load_candles(args.data)
        log(f"loaded {len(candles['close'])} candles")
        trades, equity = simulate(strategy, candles)
        log(f"simulated {len(trades)} trades")
        result = summarize(strategy, candles, trades, equity, started)
    except EngineError as e:
        print(json.dumps({"error": str(e)}))
        return 2
    except (OSError, json.JSONDecodeError) as e:
        print(json.dumps({"error": f"Input error: {e}"}))
        return 2
    sys.stdout.write(json.dumps(result, separators=(",", ":")))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
