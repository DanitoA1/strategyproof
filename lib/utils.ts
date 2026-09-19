/** Pull the outermost JSON object out of a model response (handles ```json fences and preambles). */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model response");
  return JSON.parse(trimmed.slice(start, end + 1));
}

/** Some reasoning models put their answer after a think block. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

export function envFlag(name: string): boolean {
  return (process.env[name] ?? "").toLowerCase() === "true";
}

export class StageError extends Error {
  constructor(
    public stage: string,
    public userMessage: string,
    cause?: unknown,
  ) {
    super(userMessage, { cause });
  }
}
