import type { CompletedEvent } from "@/lib/stream";
import { MetricCard } from "./MetricCard";
import { ReviewPanel } from "./ReviewPanel";
import { StrategyViewer } from "./StrategyViewer";

const pct = (n: number, signed = false) => `${signed && n > 0 ? "+" : ""}${n.toFixed(1)}%`;
const day = (iso: string) => iso.slice(0, 10);

export function ResultsDashboard({ result }: { result: CompletedEvent }) {
  const { backtest, review, execution, strategy } = result;
  const p = backtest.performance;

  return (
    <div className="space-y-5 animate-fade-up">
      <section className="rounded-2xl border border-line bg-panel/80 p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Historical evidence</h2>
          <span className="text-sm font-medium">{strategy.name}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Net return" value={pct(p.netReturnPct, true)} tone={p.netReturnPct >= 0 ? "good" : "bad"} />
          <MetricCard label="Max drawdown" value={`-${p.maxDrawdownPct.toFixed(1)}%`} tone="bad" />
          <MetricCard label="Trades" value={p.trades.toLocaleString("en-US")} hint={p.trades < 30 ? "small sample" : undefined} />
          <MetricCard label="Win rate" value={pct(p.winRatePct)} hint={`${p.wins}W / ${p.losses}L`} />
          <MetricCard label="Profit factor" value={p.profitFactor === null ? "∞" : p.profitFactor.toFixed(2)} />
          <MetricCard label="Average R" value={`${p.averageR > 0 ? "+" : ""}${p.averageR.toFixed(2)}R`} />
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <EquityCurve points={backtest.equityCurve} start={p.startingEquity} />
          <Segments segments={backtest.segments} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs sm:grid-cols-4">
          <Meta label="Historical period" value={`${day(backtest.meta.start)} → ${day(backtest.meta.end)}`} />
          <Meta label="Candles" value={backtest.meta.candles.toLocaleString("en-US")} />
          <Meta label="Spread assumption" value={`${backtest.meta.spreadPips} pips`} />
          <Meta label="Risk per trade" value={`${backtest.meta.riskPerTradePct}% of equity`} />
        </div>
        <p className="mt-3 text-[11px] text-muted/80">
          No single metric proves a strategy works. Signals on candle close, fills at next open, stop loss assumed first when
          both levels touch in one candle.
        </p>
      </section>

      <ReviewPanel review={review} model={execution.nosanaModel} />
      <StrategyViewer result={result} />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-text">{value}</div>
    </div>
  );
}

function EquityCurve({ points, start }: { points: { time: string; equity: number }[]; start: number }) {
  const W = 600;
  const H = 180;
  if (points.length < 2) return <div className="text-xs text-muted">Not enough trades for an equity curve.</div>;
  const values = points.map((p) => p.equity);
  const min = Math.min(...values, start);
  const max = Math.max(...values, start);
  const range = max - min || 1;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - min) / range) * (H - 16) - 8;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
  const up = values[values.length - 1] >= start;
  const stroke = up ? "var(--accent)" : "var(--bad)";

  return (
    <div className="rounded-xl border border-line bg-bg/50 p-3">
      <div className="mb-2 flex justify-between text-[11px] text-muted">
        <span>Equity curve (closed trades)</span>
        <span className="font-mono">
          ${Math.round(values[values.length - 1]).toLocaleString("en-US")}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none" role="img" aria-label="Equity curve">
        <defs>
          <linearGradient id="eqfill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(start)} y2={y(start)} stroke="var(--line)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#eqfill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
        <span>{day(points[0].time)}</span>
        <span>{day(points[points.length - 1].time)}</span>
      </div>
    </div>
  );
}

function Segments({ segments }: { segments: { name: string; trades: number; returnPct: number; winRatePct: number }[] }) {
  const maxAbs = Math.max(...segments.map((s) => Math.abs(s.returnPct)), 1);
  return (
    <div className="rounded-xl border border-line bg-bg/50 p-3">
      <div className="mb-3 text-[11px] text-muted">Stability across dataset thirds</div>
      <div className="space-y-3">
        {segments.map((s) => (
          <div key={s.name}>
            <div className="flex justify-between text-xs">
              <span className="capitalize text-text">{s.name}</span>
              <span className={`font-mono ${s.returnPct >= 0 ? "text-accent" : "text-bad"}`}>{pct(s.returnPct, true)}</span>
            </div>
            <div className="relative mt-1 h-2 rounded-full bg-panel-2">
              <div className="absolute left-1/2 top-0 h-2 w-px bg-line" />
              <div
                className={`absolute top-0 h-2 rounded-full ${s.returnPct >= 0 ? "bg-accent/80" : "bg-bad/80"}`}
                style={{
                  width: `${(Math.abs(s.returnPct) / maxAbs) * 50}%`,
                  left: s.returnPct >= 0 ? "50%" : `${50 - (Math.abs(s.returnPct) / maxAbs) * 50}%`,
                }}
              />
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted">
              {s.trades} trades · {s.winRatePct.toFixed(0)}% win
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
