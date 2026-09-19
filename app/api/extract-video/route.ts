import { z } from "zod";
import { StageError } from "@/lib/utils";
import { extractStrategyFromVideo, isSupportedVideoUrl } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const requestSchema = z.object({ url: z.string().trim().max(500) });

export async function POST(req: Request) {
  const body = requestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success || !isSupportedVideoUrl(body.data.url)) {
    return Response.json({ error: "Paste a YouTube link (youtube.com/watch, youtu.be or Shorts)." }, { status: 400 });
  }
  try {
    const extraction = await extractStrategyFromVideo(body.data.url);
    return Response.json(extraction);
  } catch (e) {
    const message = e instanceof StageError ? e.userMessage : "Couldn't analyse that video.";
    return Response.json({ error: message }, { status: 502 });
  }
}
