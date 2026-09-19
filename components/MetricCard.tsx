export function MetricCard({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | "neutral";
  hint?: string;
}) {
  const color = tone === "good" ? "text-accent" : tone === "bad" ? "text-bad" : "text-text";
  return (
    <div className="rounded-xl border border-line bg-panel-2/70 p-4">
      <div className={`font-mono text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] text-muted/70">{hint}</div>}
    </div>
  );
}
