import type { RobustnessReview } from "@/lib/result-schema";

const SEVERITY: Record<string, string> = {
  high: "border-bad/40 bg-bad/10 text-bad",
  medium: "border-warn/40 bg-warn/10 text-warn",
  low: "border-line bg-panel-2 text-muted",
};

export function ReviewPanel({ review, model }: { review: RobustnessReview | null; model: string | null }) {
  return (
    <section className="rounded-2xl border border-line bg-panel/80 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Robustness review</h3>
        <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-px text-[10px] font-medium text-accent">
          Independent · Nosana{model ? ` · ${model}` : ""}
        </span>
      </div>

      {!review ? (
        <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-warn">
          Backtest completed. Independent AI review is temporarily unavailable.
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-text">{review.summary}</p>

          {review.warnings.length > 0 && (
            <ul className="space-y-2">
              {review.warnings.map((w, i) => (
                <li key={i} className="flex gap-3 rounded-xl border border-line bg-panel-2/60 p-3">
                  <span className={`h-fit shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY[w.severity]}`}>
                    {w.severity}
                  </span>
                  <div>
                    <div className="text-sm font-medium">⚠ {w.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-muted">{w.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {review.strengths.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">What holds up</div>
                <ul className="space-y-1.5">
                  {review.strengths.map((s, i) => (
                    <li key={i} className="text-xs leading-relaxed text-text">
                      <span className="text-accent">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {review.nextTests.length > 0 && (
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Evidence to collect next</div>
                <ul className="space-y-1.5">
                  {review.nextTests.map((s, i) => (
                    <li key={i} className="text-xs leading-relaxed text-text">
                      <span className="text-info">→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
