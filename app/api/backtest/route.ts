import { z } from "zod";
import { readEngineSource, runBacktestInSandbox } from "@/lib/daytona";
import { parseStrategy } from "@/lib/kimi";
import { reviewBacktest } from "@/lib/nosana";
import { ndjsonStream, type Stage, type StatusEvent } from "@/lib/stream";
import { describeCondition } from "@/lib/strategy-schema";
import { StageError } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const requestSchema = z.object({ idea: z.string().trim().min(10).max(2000) });

const FALLBACK_MESSAGES: Partial<Record<Stage, string>> = {
  parsing_strategy: "We couldn't convert that strategy into supported rules.",
  creating_sandbox: "Could not create the isolated Daytona sandbox.",
  executing_backtest: "The isolated backtest environment failed during execution.",
};

export async function POST(req: Request) {
  const body = requestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Describe a strategy in 10–2,000 characters." }, { status: 400 });
  }
  const idea = body.data.idea;

  const stream = ndjsonStream(async (send) => {
    const t0 = Date.now();
    let stage: Stage = "request_received";
    const status = (s: Stage, message: string, metadata?: StatusEvent["metadata"]) => {
      stage = s;
      send({ type: "status", stage: s, message, at: Date.now() - t0, metadata });
    };

    try {
      status("request_received", "Strategy received.", { characters: idea.length });

      // 1. Kimi: natural language -> validated DSL. No sandbox exists until this succeeds.
      status("parsing_strategy", "Kimi is converting the idea into trading rules…");
      const parsed = await parseStrategy(idea);
      const { strategy } = parsed;
      status("strategy_parsed", "Kimi converted natural language into trading rules.", {
        name: strategy.name,
        direction: strategy.direction,
        rules: strategy.entry.conditions.map(describeCondition),
        model: parsed.model,
        repaired: parsed.repaired,
      });

      // 2. Daytona: isolated execution.
      const { result: backtest, sandboxId } = await runBacktestInSandbox(strategy, (e) => {
        switch (e.stage) {
          case "creating_sandbox":
            return status(e.stage, "Creating isolated Daytona sandbox…");
          case "sandbox_created":
            return status(e.stage, "Created Daytona sandbox.", { sandboxId: e.sandboxId, target: e.target, createMs: e.createMs });
          case "uploading_files":
            return status(e.stage, "Uploading strategy, engine and market data…", { workdir: e.workdir, files: e.files });
          case "files_uploaded":
            return status(e.stage, "Uploaded EURUSD historical dataset.", { candles: e.candles });
          case "executing_backtest":
            return status(e.stage, "Executing historical simulation in the sandbox…", { command: e.command });
          case "backtest_completed":
            return status(e.stage, "Executed historical simulation.", { trades: e.trades, engineMs: e.engineMs, host: e.host });
          case "destroying_sandbox":
            return status(e.stage, "Destroying Daytona sandbox…", { sandboxId: e.sandboxId });
          case "sandbox_destroyed":
            return status(e.stage, "Destroyed Daytona sandbox.", { sandboxId: e.sandboxId });
          case "sandbox_cleanup_failed":
            return status(e.stage, "Sandbox deletion requested; Daytona will auto-remove it.", { sandboxId: e.sandboxId });
        }
      });

      // 3. Nosana: independent critique. Failure here never discards the backtest.
      status("reviewing_results", "Nosana is independently reviewing the evidence…");
      const reviewed = await reviewBacktest(strategy, backtest);
      if (reviewed) {
        status("review_completed", "Nosana independently reviewed the evidence.", {
          model: reviewed.model,
          warnings: reviewed.review.warnings.length,
        });
      } else {
        status("review_unavailable", "Independent AI review is temporarily unavailable.");
      }

      send({
        type: "completed",
        strategy,
        backtest,
        review: reviewed?.review ?? null,
        engineSource: await readEngineSource(),
        execution: {
          sandboxId,
          elapsedMs: Date.now() - t0,
          kimiModel: parsed.model,
          nosanaModel: reviewed?.model ?? null,
        },
      });
    } catch (e) {
      console.error(`[backtest] failed at ${stage}:`, e);
      const message =
        e instanceof StageError ? e.userMessage : (FALLBACK_MESSAGES[stage] ?? "Something went wrong while running the strategy.");
      send({ type: "error", stage: e instanceof StageError ? (e.stage as Stage) : stage, message });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
