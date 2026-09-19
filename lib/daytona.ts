import { readFile } from "node:fs/promises";
import path from "node:path";
import { Daytona, type Sandbox } from "@daytona/sdk";
import { backtestResultSchema, type BacktestResult } from "./result-schema";
import type { StrategyDefinition } from "./strategy-schema";
import { StageError } from "./utils";

const ENGINE_PATH = path.join(/*turbopackIgnore: true*/ process.cwd(), "engine", "backtest.py");
const DATASET_PATH = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATASET_PATH ?? "./data/eurusd_15m.csv");
const EXEC_TIMEOUT_S = 60;

export type SandboxEvent =
  | { stage: "creating_sandbox" }
  | { stage: "sandbox_created"; sandboxId: string; target?: string; createMs: number }
  | { stage: "uploading_files"; workdir: string; files: { name: string; bytes: number }[] }
  | { stage: "files_uploaded"; candles: number }
  | { stage: "executing_backtest"; command: string }
  | { stage: "backtest_completed"; trades: number; engineMs: number; host: string }
  | { stage: "destroying_sandbox"; sandboxId: string }
  | { stage: "sandbox_destroyed"; sandboxId: string }
  | { stage: "sandbox_cleanup_failed"; sandboxId: string };

let client: Daytona | null = null;
function daytona(): Daytona {
  client ??= new Daytona({
    apiKey: process.env.DAYTONA_API_KEY,
    apiUrl: process.env.DAYTONA_API_URL || undefined,
    target: process.env.DAYTONA_TARGET || undefined,
  });
  return client;
}

let cachedFiles: { engine: Buffer; dataset: Buffer; candles: number } | null = null;
async function loadFiles() {
  if (!cachedFiles) {
    const [engine, dataset] = await Promise.all([readFile(ENGINE_PATH), readFile(DATASET_PATH)]);
    const lines = dataset.toString("utf8").trimEnd().split("\n").length;
    cachedFiles = { engine, dataset, candles: lines - 1 };
  }
  return cachedFiles;
}

export async function readEngineSource(): Promise<string> {
  return (await loadFiles()).engine.toString("utf8");
}

/**
 * Create an isolated sandbox, run the fixed backtest command against the uploaded
 * strategy + dataset, then always destroy the sandbox.
 */
export async function runBacktestInSandbox(
  strategy: StrategyDefinition,
  emit: (e: SandboxEvent) => void,
): Promise<{ result: BacktestResult; sandboxId: string }> {
  const files = await loadFiles();

  emit({ stage: "creating_sandbox" });
  const createStart = Date.now();
  let sandbox: Sandbox;
  try {
    sandbox = await daytona().create(
      {
        language: "python",
        ephemeral: true, // belt and braces: auto-deleted once stopped
        autoStopInterval: 10,
        labels: { app: "strategyproof" },
      },
      { timeout: 60 },
    );
  } catch (e) {
    console.error("[daytona] create failed:", e);
    throw new StageError("creating_sandbox", "Could not create the isolated Daytona sandbox.", e);
  }
  const sandboxId = sandbox.id;
  emit({ stage: "sandbox_created", sandboxId, target: sandbox.target, createMs: Date.now() - createStart });

  try {
    const home = (await sandbox.getUserHomeDir()) ?? "/home/daytona";
    const workdir = `${home}/workspace`;
    await sandbox.fs.createFolder(workdir, "755");

    const strategyJson = Buffer.from(JSON.stringify(strategy, null, 2));
    emit({
      stage: "uploading_files",
      workdir,
      files: [
        { name: "backtest.py", bytes: files.engine.length },
        { name: "strategy.json", bytes: strategyJson.length },
        { name: "eurusd_15m.csv", bytes: files.dataset.length },
      ],
    });
    try {
      await sandbox.fs.uploadFiles(
        [
          { source: files.engine, destination: `${workdir}/backtest.py` },
          { source: strategyJson, destination: `${workdir}/strategy.json` },
          { source: files.dataset, destination: `${workdir}/eurusd_15m.csv` },
        ],
        120,
      );
    } catch (e) {
      console.error("[daytona] upload failed:", e);
      throw new StageError("uploading_files", "Failed to upload files into the Daytona sandbox.", e);
    }
    emit({ stage: "files_uploaded", candles: files.candles });

    // Fixed, application-controlled command. User text never reaches the shell.
    const command = `python3 ${workdir}/backtest.py --strategy ${workdir}/strategy.json --data ${workdir}/eurusd_15m.csv`;
    emit({ stage: "executing_backtest", command: "python3 backtest.py --strategy strategy.json --data eurusd_15m.csv" });
    let execution;
    try {
      execution = await sandbox.process.executeCommand(`${command} 2>${workdir}/engine.log`, workdir, undefined, EXEC_TIMEOUT_S);
    } catch (e) {
      console.error("[daytona] execute failed:", e);
      throw new StageError("executing_backtest", "The isolated backtest environment failed during execution.", e);
    }
    if (execution.exitCode !== 0) {
      console.error("[daytona] engine exit", execution.exitCode, execution.result);
      throw new StageError("executing_backtest", "The isolated backtest environment failed during execution.");
    }

    const lastLine = execution.result.trim().split("\n").pop() ?? "";
    const parsed = backtestResultSchema.safeParse(JSON.parse(lastLine));
    if (!parsed.success) {
      console.error("[daytona] invalid engine output:", parsed.error);
      throw new StageError("executing_backtest", "The backtest engine returned an unexpected result.");
    }
    emit({
      stage: "backtest_completed",
      trades: parsed.data.performance.trades,
      engineMs: parsed.data.engine.elapsedMs,
      host: parsed.data.engine.host,
    });
    return { result: parsed.data, sandboxId };
  } finally {
    // Progress events must never prevent deletion.
    const safeEmit = (e: SandboxEvent) => {
      try {
        emit(e);
      } catch {
        // ignore
      }
    };
    safeEmit({ stage: "destroying_sandbox", sandboxId });
    try {
      await sandbox.delete(60, true);
      safeEmit({ stage: "sandbox_destroyed", sandboxId });
    } catch (e) {
      console.error("[daytona] cleanup failed for", sandboxId, e);
      safeEmit({ stage: "sandbox_cleanup_failed", sandboxId });
    }
  }
}
