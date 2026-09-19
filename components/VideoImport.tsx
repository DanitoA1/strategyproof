"use client";

import { useState } from "react";

type Extraction = {
  found: boolean;
  title: string;
  summary: string;
  strategyText: string;
  adaptations: string[];
  missing: string[];
  model: string;
  elapsedMs: number;
};

export function VideoImport({ onExtracted, disabled }: { onExtracted: (text: string) => void; disabled: boolean }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extraction | null>(null);

  async function extract() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/extract-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await res.json();
      if (!res.ok) return setError(body.error ?? "Couldn't analyse that video.");
      setResult(body);
      if (body.found && body.strategyText) onExtracted(body.strategyText);
    } catch {
      setError("Couldn't reach the video analyser.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-panel/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Import from a YouTube video</span>
        <span className="rounded-full border border-warn/30 bg-warn/10 px-2 py-px text-[10px] font-medium text-warn">
          Gemini · video
        </span>
      </div>
      <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !loading && url && extract()}
          placeholder="https://www.youtube.com/watch?v=…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-bg/70 px-3 py-2 font-mono text-sm text-text placeholder:text-muted/60 focus:border-warn/60 focus:outline-none"
        />
        <button
          type="button"
          onClick={extract}
          disabled={disabled || loading || !url.trim()}
          className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-2 text-sm font-semibold text-warn transition hover:bg-warn/20 disabled:opacity-40"
        >
          {loading ? "Watching video…" : "Extract strategy"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-bad">{error}</p>}

      {result && (
        <div className="mt-3 rounded-xl border border-line bg-bg/50 p-3 text-xs leading-relaxed animate-fade-up">
          {result.found ? (
            <>
              <div className="text-text">
                <span className="font-semibold">{result.title}</span> · {result.summary}
              </div>
              <div className="mt-1 text-muted">
                Strategy text filled in below. Review or edit it, then run StrategyProof.
              </div>
              {result.adaptations.length > 0 && (
                <div className="mt-1.5 text-info">Adapted: {result.adaptations.join(" · ")}</div>
              )}
              {result.missing.length > 0 && (
                <div className="mt-1 text-warn">Not stated in the video: {result.missing.join(" · ")}</div>
              )}
            </>
          ) : (
            <div className="text-warn">No concrete, rule-based strategy found in this video.</div>
          )}
          <div className="mt-1.5 font-mono text-[10px] text-muted/70">
            {result.model} · {(result.elapsedMs / 1000).toFixed(1)}s
          </div>
        </div>
      )}
    </section>
  );
}
