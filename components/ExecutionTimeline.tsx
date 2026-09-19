"use client";

import type { ErrorEvent, Stage, StatusEvent } from "@/lib/stream";

type Step = {
  key: string;
  label: string;
  sponsor: "Kimi" | "Daytona" | "Nosana";
  start: Stage;
  done: Stage[];
  detail: (meta: Record<string, unknown>, done?: StatusEvent) => React.ReactNode;
};

const fmt = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : String(n ?? ""));

const STEPS: Step[] = [
  {
    key: "kimi",
    label: "Kimi converts natural language into trading rules",
    sponsor: "Kimi",
    start: "parsing_strategy",
    done: ["strategy_parsed"],
    detail: (m) =>
      Array.isArray(m.rules) ? (
        <>
          <span className="text-text">{String(m.name)}</span> · {String(m.direction)} ·{" "}
          {(m.rules as string[]).join(" AND ")}
        </>
      ) : null,
  },
  {
    key: "create",
    label: "Create isolated Daytona sandbox",
    sponsor: "Daytona",
    start: "creating_sandbox",
    done: ["sandbox_created"],
    detail: (m) =>
      m.sandboxId ? (
        <>
          <span className="rounded bg-info/10 px-1.5 py-0.5 font-mono text-info">{String(m.sandboxId)}</span>
          {m.target ? <span> · region {String(m.target)}</span> : null}
        </>
      ) : null,
  },
  {
    key: "upload",
    label: "Upload backtest.py, strategy.json and EURUSD history",
    sponsor: "Daytona",
    start: "uploading_files",
    done: ["files_uploaded"],
    detail: (m) => (m.candles ? <>{fmt(m.candles)} candles of real EURUSD 15m data</> : null),
  },
  {
    key: "exec",
    label: "Execute historical simulation inside the sandbox",
    sponsor: "Daytona",
    start: "executing_backtest",
    done: ["backtest_completed"],
    detail: (m) =>
      m.trades !== undefined ? (
        <>
          {fmt(m.trades)} trades simulated · engine {fmt(m.engineMs)} ms · host{" "}
          <span className="font-mono">{String(m.host)}</span>
        </>
      ) : m.command ? (
        <span className="font-mono">$ {String(m.command)}</span>
      ) : null,
  },
  {
    key: "destroy",
    label: "Destroy Daytona sandbox",
    sponsor: "Daytona",
    start: "destroying_sandbox",
    done: ["sandbox_destroyed", "sandbox_cleanup_failed"],
    detail: (m, d) =>
      d?.stage === "sandbox_cleanup_failed" ? "Deletion requested; ephemeral sandbox will auto-remove." : m.sandboxId ? <>Sandbox {String(m.sandboxId).slice(0, 12)}… no longer exists</> : null,
  },
  {
    key: "review",
    label: "Nosana independently reviews the evidence",
    sponsor: "Nosana",
    start: "reviewing_results",
    done: ["review_completed", "review_unavailable"],
    detail: (m, d) =>
      d?.stage === "review_unavailable" ? (
        "Independent AI review is temporarily unavailable."
      ) : m.model ? (
        <>
          open model <span className="font-mono">{String(m.model)}</span> · {fmt(m.warnings)} warnings raised
        </>
      ) : null,
  },
];

const SPONSOR_STYLE: Record<Step["sponsor"], string> = {
  Kimi: "text-violet-300 border-violet-400/30 bg-violet-400/10",
  Daytona: "text-info border-info/30 bg-info/10",
  Nosana: "text-accent border-accent/30 bg-accent/10",
};

export function ExecutionTimeline({
  events,
  error,
  running,
}: {
  events: StatusEvent[];
  error: ErrorEvent | null;
  running: boolean;
}) {
  const byStage = new Map(events.map((e) => [e.stage, e]));
  const errorStepIdx = error ? STEPS.findIndex((s) => s.start === error.stage || s.done.includes(error.stage)) : -1;

  return (
    <section className="rounded-2xl border border-line bg-panel/80 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Agent activity</h2>
        {events.length > 0 && (
          <span className="font-mono text-[11px] text-muted">
            {((events[events.length - 1]?.at ?? 0) / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      <ol className="space-y-1">
        {STEPS.map((step, idx) => {
          const started = byStage.get(step.start);
          const doneEvt = step.done.map((s) => byStage.get(s)).find(Boolean);
          const failed = errorStepIdx === idx || (!!error && !!started && !doneEvt);
          const state = failed ? "error" : doneEvt ? "done" : started ? (running ? "active" : "stopped") : "pending";
          const meta = { ...(started?.metadata ?? {}), ...(doneEvt?.metadata ?? {}) };
          const duration = started && doneEvt ? doneEvt.at - started.at : null;
          const detail = state === "pending" ? null : step.detail(meta, doneEvt);

          return (
            <li
              key={step.key}
              className={`flex gap-3 rounded-xl px-3 py-2.5 transition ${state === "active" ? "bg-info/5" : ""} ${state !== "pending" ? "animate-fade-up" : ""}`}
            >
              <StateIcon state={state} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm ${state === "pending" ? "text-muted/60" : "text-text"}`}>{step.label}</span>
                  <span className={`rounded-full border px-2 py-px text-[10px] font-medium ${SPONSOR_STYLE[step.sponsor]}`}>
                    {step.sponsor}
                  </span>
                  {duration !== null && (
                    <span className="ml-auto font-mono text-[11px] text-muted">{(duration / 1000).toFixed(1)}s</span>
                  )}
                </div>
                {detail && <div className="mt-1 truncate text-xs text-muted">{detail}</div>}
                {failed && error && <div className="mt-1 text-xs text-bad">{error.message}</div>}
              </div>
            </li>
          );
        })}
      </ol>
      {error && errorStepIdx === -1 && <p className="mt-3 text-sm text-bad">{error.message}</p>}
    </section>
  );
}

function StateIcon({ state }: { state: string }) {
  if (state === "done")
    return (
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/20 text-accent">
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M8.1 13.3L4.8 10l-1.1 1.1 4.4 4.4 8.2-8.2-1.1-1.1z" />
        </svg>
      </span>
    );
  if (state === "active") return <span className="mt-1 h-3 w-3 shrink-0 translate-x-1 rounded-full bg-info animate-pulse-ring" />;
  if (state === "error" || state === "stopped")
    return <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bad/20 text-xs font-bold text-bad">!</span>;
  return <span className="mt-1 h-3 w-3 shrink-0 translate-x-1 rounded-full border border-line" />;
}
