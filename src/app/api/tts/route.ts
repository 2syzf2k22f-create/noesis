import { connection } from "next/server";

// Azure neural text-to-speech. Key and region live in Vercel env vars (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION).
// Free tier (F0): 500,000 characters a month of neural voices.
export const VOICES = [
  { id: "en-GB-RyanNeural", name: "Ryan", note: "warm, clear" },
  { id: "en-GB-ThomasNeural", name: "Thomas", note: "calm, measured" },
  { id: "en-GB-AlfieNeural", name: "Alfie", note: "younger, friendly" },
  { id: "en-GB-ElliotNeural", name: "Elliot", note: "bright, upbeat" },
  { id: "en-GB-EthanNeural", name: "Ethan", note: "deeper, relaxed" },
];
export const LANG_VOICES: Record<string, string> = { Spanish: "es-ES-AlvaroNeural", French: "fr-FR-HenriNeural", Mandarin: "zh-CN-YunxiNeural" };
const ALLOWED = new Set([...VOICES.map((v) => v.id), ...Object.values(LANG_VOICES)]);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET() {
  await connection();
  return Response.json({ configured: !!(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION), voices: VOICES, langVoices: LANG_VOICES });
}

export async function POST(req: Request) {
  const key = process.env.AZURE_SPEECH_KEY, region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) return Response.json({ error: "not configured" }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  const text = String(b.text ?? "").slice(0, 1500).trim();
  const voice = ALLOWED.has(b.voice) ? b.voice : VOICES[0].id;
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  const lang = voice.slice(0, 5);
  const ssml = `<speak version="1.0" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${Number(b.rate) > 0.5 && Number(b.rate) < 2 ? b.rate : 1}">${esc(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "noesis" },
    body: ssml,
  });
  if (!r.ok) return Response.json({ error: `Azure answered ${r.status}` }, { status: 502 });
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" } });
}
