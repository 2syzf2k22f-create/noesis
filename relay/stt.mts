// Backup speech-to-text on your PC: Whisper (base, multilingual, ~80 MB, downloaded once). Free, no tokens.
import { nowIso, type Row, type Store } from "../src/core/store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let asr: any = null;
async function model() {
  if (!asr) {
    const { pipeline } = await import("@huggingface/transformers");
    asr = await pipeline("automatic-speech-recognition", "Xenova/whisper-base", { dtype: "q8" });
  }
  return asr;
}
const LANG: Record<string, string> = { en: "english", Spanish: "spanish", French: "french", Mandarin: "chinese" };

export async function runStt(s: Store, job: Row) {
  const buf = Buffer.from(String(job.input?.pcm ?? ""), "base64");
  const pcm = new Int16Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 2));
  const audio = Float32Array.from(pcm, (v) => v / 32768);
  const m = await model();
  const out = await m(audio, { language: LANG[job.input?.lang] ?? "english", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
  // Whisper labels non-speech like "(crickets chirping)" or "[BLANK_AUDIO]": treat as nothing heard
  const text = String(Array.isArray(out) ? out.map((x: { text: string }) => x.text).join(" ") : out.text).replace(/[([][^)\]]*[)\]]/g, " ").replace(/\s+/g, " ").trim();
  await s.update("jobs", job.id, { status: "done", finished_at: nowIso(), input: { lang: job.input?.lang }, output: { text } });
}
