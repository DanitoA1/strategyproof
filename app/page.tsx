"use client";

import { useState } from "react";
import { ExecutionTimeline } from "@/components/ExecutionTimeline";
import { Header } from "@/components/Header";
import { ResultsDashboard } from "@/components/ResultsDashboard";
import { EXAMPLES, StrategyInput } from "@/components/StrategyInput";
import { readNdjson, type CompletedEvent, type ErrorEvent, type StatusEvent } from "@/lib/stream";

export default function Home() {
  const [idea, setIdea] = useState(EXAMPLES[0].text);
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [result, setResult] = useState<CompletedEvent | null>(null);
  const [error, setError] = useState<ErrorEvent | null>(null);

  async function run() {
    setRunning(true);
    setEvents([]);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/backtest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        setError({ type: "error", stage: "request_received", message: body.error ?? "Request failed." });
        return;
      }
      for await (const evt of readNdjson(res)) {
        if (evt.type === "status") setEvents((prev) => [...prev, evt]);
        else if (evt.type === "completed") setResult(evt);
        else if (evt.type === "error") setError(evt);
      }
    } catch {
      setError({ type: "error", stage: "request_received", message: "Connection lost while running the strategy." });
    } finally {
      setRunning(false);
    }
  }

  const started = running || events.length > 0 || !!error;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <Header />

      <section className="mb-6 mt-10 max-w-3xl">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          Don&apos;t trust a trading strategy.
          <br />
          <span className="text-accent">Test it.</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Describe a trading idea. StrategyProof turns it into executable rules, tests it inside an isolated Daytona sandbox
          and independently challenges the evidence.
        </p>
      </section>

      <div className="space-y-5">
        <StrategyInput value={idea} onChange={setIdea} onSubmit={run} running={running} />
        {started && <ExecutionTimeline events={events} error={error} running={running} />}
        {result && <ResultsDashboard result={result} />}
      </div>

      <footer className="mt-10 border-t border-line pt-4 text-center text-xs text-muted">
        Historical simulation only. Past performance does not predict future results. Not financial advice.
        <div className="mt-1 text-muted/60">EURUSD 15m · Dukascopy historical data · FXToolkit StrategyProof prototype</div>
      </footer>
    </main>
  );
}
