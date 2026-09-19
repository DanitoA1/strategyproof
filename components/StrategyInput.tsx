"use client";

export const EXAMPLES = [
  {
    label: "RSI oversold recovery",
    text: "Buy EURUSD on the 15-minute chart when RSI 14 crosses back above 30.\nUse a 20 pip stop loss and 40 pip take profit. Risk 1% per trade.",
  },
  {
    label: "EMA 20/50 cross",
    text: "Buy EURUSD when EMA 20 crosses above EMA 50.\nStop loss 25 pips. Take profit 50 pips.",
  },
  {
    label: "RSI overbought fade",
    text: "Sell EURUSD when RSI 14 crosses below 70.\nStop loss 20 pips. Take profit 30 pips.",
  },
];

const MAX = 2000;

export function StrategyInput({
  value,
  onChange,
  onSubmit,
  running,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  running: boolean;
}) {
  return (
    <section className="rounded-2xl border border-line bg-panel/80 p-5 shadow-2xl shadow-black/30">
      <label htmlFor="idea" className="text-sm font-medium text-text">
        Describe your strategy
      </label>
      <textarea
        id="idea"
        value={value}
        maxLength={MAX}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !running) onSubmit();
        }}
        rows={4}
        placeholder={"Example: On EURUSD 15m, buy when RSI 14 crosses back above 30.\nUse a 20 pip stop loss and 40 pip take profit."}
        className="mt-2 w-full resize-y rounded-xl border border-line bg-bg/70 p-3.5 font-mono text-sm leading-relaxed text-text placeholder:text-muted/60 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs text-muted">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.label}
            type="button"
            disabled={running}
            onClick={() => onChange(ex.text)}
            className="rounded-full border border-line bg-panel-2 px-3 py-1 text-xs text-muted transition hover:border-accent/50 hover:text-text disabled:opacity-40"
          >
            {ex.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted">
            {value.length}/{MAX}
          </span>
          <button
            type="button"
            onClick={onSubmit}
            disabled={running || value.trim().length < 10}
            className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {running ? "Running…" : "Run StrategyProof"}
          </button>
        </div>
      </div>
    </section>
  );
}
