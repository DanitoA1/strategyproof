"use client";

import { useState } from "react";
import type { CompletedEvent } from "@/lib/stream";
import { describeCondition } from "@/lib/strategy-schema";

const TABS = ["Interpretation", "Strategy JSON", "Execution code", "Execution details"] as const;

export function StrategyViewer({ result }: { result: CompletedEvent }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Interpretation");
  const { strategy, execution, backtest } = result;

  return (
    <details className="group rounded-2xl border border-line bg-panel/80" open>
      <summary className="flex cursor-pointer list-none items-center justify-between p-5 text-sm font-semibold">
        How StrategyProof interpreted and executed this idea
        <span className="text-muted transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="px-5 pb-5">
        <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-bg/60 p-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${tab === t ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Interpretation" && (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Field label="Market">EURUSD / 15 minute</Field>
            <Field label="Direction">{strategy.direction === "long" ? "Long (buy)" : "Short (sell)"}</Field>
            <Field label="Entry (all must be true, on candle close)">
              {strategy.entry.conditions.map((c, i) => (
                <div key={i} className="font-mono text-xs">
                  {describeCondition(c)}
                </div>
              ))}
            </Field>
            <Field label="Risk">
              Stop loss: {strategy.risk.stopLossPips} pips
              <br />
              Take profit: {strategy.risk.takeProfitPips} pips
              <br />
              Risk per trade: {strategy.risk.riskPerTradePct}%
            </Field>
            <Field label="Cost assumption">Spread: {strategy.costs.spreadPips} pips per trade</Field>
            <Field label="Fill model">{backtest.meta.fillModel}</Field>
          </dl>
        )}

        {tab === "Strategy JSON" && <Code>{JSON.stringify(strategy, null, 2)}</Code>}

        {tab === "Execution code" && (
          <>
            <p className="mb-3 text-xs leading-relaxed text-muted">
              This deterministic execution engine was uploaded to the isolated Daytona sandbox together with the generated
              strategy definition and market data. Kimi produces only the constrained strategy JSON, never executable code.
            </p>
            <Code>{result.engineSource}</Code>
          </>
        )}

        {tab === "Execution details" && (
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Field label="Daytona sandbox">
              <span className="font-mono text-xs text-info">{execution.sandboxId}</span>
              <div className="text-xs text-muted">created → files uploaded → executed → destroyed</div>
            </Field>
            <Field label="Sandbox runtime">
              Python {backtest.engine.python} on <span className="font-mono text-xs">{backtest.engine.host}</span>
              <div className="text-xs text-muted">engine time {backtest.engine.elapsedMs} ms</div>
            </Field>
            <Field label="Strategy parser (Kimi)">
              <span className="font-mono text-xs">{execution.kimiModel}</span>
            </Field>
            <Field label="Independent reviewer (Nosana)">
              <span className="font-mono text-xs">{execution.nosanaModel ?? "unavailable"}</span>
            </Field>
            <Field label="End-to-end time">{(execution.elapsedMs / 1000).toFixed(1)} s</Field>
            <Field label="Command (fixed, app-controlled)">
              <span className="font-mono text-xs">python3 backtest.py --strategy strategy.json --data eurusd_15m.csv</span>
            </Field>
          </dl>
        )}
      </div>
    </details>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-text">{children}</dd>
    </div>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="max-h-[420px] overflow-auto rounded-xl border border-line bg-bg/80 p-4 font-mono text-[11.5px] leading-relaxed text-text/90">
      {children}
    </pre>
  );
}
