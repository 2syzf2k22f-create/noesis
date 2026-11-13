import { relayOnline, storeOr503 } from "@/core/api";

/** Backup speech-to-text: queue 16 kHz PCM for the relay's local Whisper model. POST {pcm: base64} -> {jobId}. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const pcm = typeof b.pcm === "string" ? b.pcm : "";
  if (pcm.length < 1000 || pcm.length > 4_000_000) return Response.json({ error: "bad audio" }, { status: 400 });
  const { online } = await relayOnline(s);
  if (!online) return Response.json({ error: "relay offline" }, { status: 503 });
  const job = await s.insert("jobs", { kind: "stt", status: "queued", input: { pcm, lang: typeof b.lang === "string" ? b.lang : "en" }, ui_actions: [], output: null });
  return Response.json({ jobId: job.id });
}
