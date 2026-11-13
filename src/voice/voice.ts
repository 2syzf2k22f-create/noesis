"use client";
// Browser voice: speech recognition (STT) and speech synthesis (TTS).
// Chrome/Edge send recognition audio to the browser vendor's servers; Safari supports it on
// iOS 14.5+; Firefox has none. Local Whisper / Kokoro on the relay PC are a later upgrade.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;
const Ctor = () => (typeof window === "undefined" ? null : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null));
export const sttSupported = () => !!Ctor();
export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export type Listener = { stop: () => void; abort: () => void };

/** One utterance: interim text while you talk, final text when you stop. */
export function listenOnce(o: { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError?: (e: string) => void }, opts: { untilStopped?: boolean } = {}): Listener | null {
  const C = Ctor();
  if (!C) return null;
  let final = "", interimNow = "", stopping = false, done = false;
  let r: Rec;
  // when you stop, use everything heard, including words the browser hadn't marked final yet
  const finish = () => { if (done) return; done = true; const all = `${final} ${interimNow}`.trim(); if (all) o.onFinal(all); o.onEnd(); };
  const start = () => {
    r = new C();
    r.lang = "en-GB";
    r.interimResults = true;
    // untilStopped: keep listening through pauses until stop() (Alt+P again); browsers end a session on silence, so restart it
    r.continuous = !!opts.untilStopped;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += (final && !final.endsWith(" ") ? " " : "") + t.trim(); else interim += t;
      }
      interimNow = interim.trim();
      o.onInterim(`${final} ${interim}`.trim());
    };
    r.onerror = (e: any) => { if (e.error !== "no-speech" && e.error !== "aborted") o.onError?.(e.error ?? "error"); };
    r.onend = () => { if (opts.untilStopped && !stopping) { try { start(); } catch { finish(); } } else finish(); };
    r.start();
  };
  start();
  return {
    // some browsers never fire "end" after stop(): finish anyway after a moment
    stop: () => { stopping = true; try { r.stop(); } catch {} setTimeout(finish, 1200); },
    abort: () => { stopping = true; final = ""; interimNow = ""; done = true; try { r.abort(); } catch {} o.onEnd(); },
  };
}

/** Wake word: listens continuously; calls onWake with whatever followed "Apollo" (may be empty). */
export function wakeWord(word: string, onWake: (rest: string) => void): Listener | null {
  const C = Ctor();
  if (!C) return null;
  let stopped = false;
  let r: Rec;
  const re = new RegExp(`\\b${word}\\b[,.!?]?\\s*(.*)$`, "i");
  const start = () => {
    r = new C();
    r.lang = "en-GB";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e: any) => {
      const t = e.results[e.results.length - 1][0].transcript as string;
      const m = re.exec(t);
      if (m) onWake(m[1].trim());
    };
    r.onend = () => { if (!stopped) setTimeout(start, 300); }; // browsers stop after silence; keep it alive
    try { r.start(); } catch {}
  };
  start();
  return { stop: () => { stopped = true; r?.stop(); }, abort: () => { stopped = true; r?.abort(); } };
}

/* ---------- TTS ---------- */

let chosen: SpeechSynthesisVoice | null = null;
export const VOICE_KEY = "noesis.voiceName";
/** British male, natural-sounding voices first (Edge's "Ryan/Thomas Online (Natural)", Chrome's "Google UK English Male", Apple's "Daniel"). A voice chosen in the Apollo panel wins. */
export function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  let saved: string | null = null;
  try { saved = localStorage.getItem(VOICE_KEY); } catch {}
  const pick = saved ? vs.find((v) => v.name === saved) : undefined;
  if (pick) return (chosen = pick);
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang === "en-GB" ? 6 : 0) +
    (/\b(ryan|thomas|george|daniel|oliver|arthur|alfie|elliot|ethan|noah|uk english male|male)\b/i.test(v.name) ? 6 : 0) +
    (/natural|neural|online|premium|enhanced/i.test(v.name) ? 5 : 0) -
    (/\b(sonia|libby|serena|maisie|hazel|susan|kate|female|jenny|aria|martha|bella|stephanie)\b/i.test(v.name) ? 5 : 0) +
    (v.localService ? 0 : 1);
  chosen = vs.sort((a, b) => score(b) - score(a))[0] ?? null;
  return chosen;
}
export function setVoice(name: string | null) {
  try { if (name) localStorage.setItem(VOICE_KEY, name); else localStorage.removeItem(VOICE_KEY); } catch {}
  chosen = null;
  return pickVoice();
}
export function englishVoices() {
  return ttsSupported() ? speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")).sort((a, b) => (a.lang === "en-GB" ? -1 : 1) - (b.lang === "en-GB" ? -1 : 1) || a.name.localeCompare(b.name)) : [];
}

/* ---------- Azure neural voices (when configured), else the browser's own ---------- */
export const AZURE_VOICE_KEY = "noesis.azureVoice";
let azure: { configured: boolean; voices: { id: string; name: string; note: string }[]; langVoices: Record<string, string> } | null = null;
export async function azureInfo() {
  if (azure) return azure;
  try { azure = await fetch("/api/tts").then((r) => r.json()); } catch { azure = { configured: false, voices: [], langVoices: {} }; }
  return azure!;
}
export function azureVoice() { try { return localStorage.getItem(AZURE_VOICE_KEY) || "en-GB-RyanNeural"; } catch { return "en-GB-RyanNeural"; } }
export function setAzureVoice(id: string) { try { localStorage.setItem(AZURE_VOICE_KEY, id); } catch {} }
if (typeof window !== "undefined") void azureInfo();

/**
 * Speaks a reply as it streams: each finished sentence is queued once.
 * Azure voices are fetched a sentence ahead so there are no gaps; `onWord` pulses drive the orb.
 * `lang` (e.g. "Spanish") picks a native voice for language practice.
 */
export function createSpeaker(o: { onStart: () => void; onEnd: () => void; onWord: () => void; lang?: string }) {
  let spoken = 0;
  let pending = 0;
  let cancelled = false;
  let started = false;
  const useAzure = !!azure?.configured;
  const voiceId = (o.lang && azure?.langVoices?.[o.lang]) || azureVoice();
  let chain: Promise<void> = Promise.resolve();
  let current: HTMLAudioElement | null = null;
  const done = () => { pending--; if (pending <= 0 && !cancelled) o.onEnd(); };
  const sayAzure = (text: string) => {
    pending++;
    // fetch now (in parallel), play in order
    const audio = fetch("/api/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, voice: voiceId }) })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("tts")))).then((b) => URL.createObjectURL(b));
    chain = chain.then(() => audio.then((url) => new Promise<void>((res) => {
      if (cancelled) { URL.revokeObjectURL(url); return res(); }
      const a = new Audio(url);
      current = a;
      let tick: ReturnType<typeof setInterval> | null = null;
      a.onplay = () => { if (!started) { started = true; o.onStart(); } o.onWord(); tick = setInterval(o.onWord, 180); };
      a.onended = a.onerror = () => { if (tick) clearInterval(tick); URL.revokeObjectURL(url); res(); };
      a.play().catch(() => res());
    })).catch(() => { sayBrowser(text, true); })).then(done);
  };
  const sayBrowser = (text: string, already = false) => {
    if (!text.trim() || cancelled || !ttsSupported()) { if (already) return; return; }
    const u = new SpeechSynthesisUtterance(text);
    u.voice = chosen ?? pickVoice();
    u.rate = 1.0;
    u.pitch = 0.95;
    u.onstart = () => { if (!started) { started = true; o.onStart(); } o.onWord(); };
    u.onboundary = () => o.onWord();
    if (!already) { pending++; u.onend = u.onerror = done; }
    speechSynthesis.speak(u);
  };
  const say = (text: string) => {
    if (!text.trim() || cancelled) return;
    if (useAzure) sayAzure(text); else sayBrowser(text);
  };
  return {
    /** Feed the reply-so-far; speaks complete sentences not yet spoken. */
    feed(full: string, isDone = false) {
      const rest = full.slice(spoken);
      const m = isDone ? rest.length : (() => { const r = /[.!?。！？](\s|$)(?![\s\S]*[.!?。！？](\s|$))/.exec(rest); return r ? r.index + 1 : 0; })();
      if (m > 0) { say(rest.slice(0, m).replace(/[*#`_]/g, "")); spoken += m; }
      if (isDone && pending === 0 && !cancelled) o.onEnd();
    },
    cancel() { cancelled = true; current?.pause(); if (ttsSupported()) speechSynthesis.cancel(); },
  };
}
