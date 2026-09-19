import type { BacktestResult, RobustnessReview } from "./result-schema";
import type { StrategyDefinition } from "./strategy-schema";

export type Stage =
  | "request_received"
  | "parsing_strategy"
  | "strategy_parsed"
  | "creating_sandbox"
  | "sandbox_created"
  | "uploading_files"
  | "files_uploaded"
  | "executing_backtest"
  | "backtest_completed"
  | "destroying_sandbox"
  | "sandbox_destroyed"
  | "sandbox_cleanup_failed"
  | "reviewing_results"
  | "review_completed"
  | "review_unavailable";

export type StatusEvent = {
  type: "status";
  stage: Stage;
  message: string;
  at: number; // ms since request start
  metadata?: Record<string, unknown>;
};

export type CompletedEvent = {
  type: "completed";
  strategy: StrategyDefinition;
  backtest: BacktestResult;
  review: RobustnessReview | null;
  engineSource: string;
  execution: {
    sandboxId: string;
    elapsedMs: number;
    kimiModel: string;
    nosanaModel: string | null;
  };
};

export type ErrorEvent = { type: "error"; stage: Stage; message: string };

export type StreamEvent = StatusEvent | CompletedEvent | ErrorEvent;

export function ndjsonStream(run: (send: (e: StreamEvent) => void) => Promise<void>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      let open = true;
      // The browser may disconnect mid-run; keep the pipeline (and sandbox cleanup) going regardless.
      const send = (e: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await run(send);
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            // already closed by a disconnect
          }
        }
      }
    },
  });
}

/** Client-side reader: yields each NDJSON event as it arrives. */
export async function* readNdjson(res: Response): AsyncGenerator<StreamEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
  if (buffer.trim()) yield JSON.parse(buffer) as StreamEvent;
}
