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
export function listenOnce(o: { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError?: (e: string) => void }): Listener | null {
  const C = Ctor();
  if (!C) return null;
  const r: Rec = new C();
  r.lang = "en-GB";
  r.interimResults = true;
  r.continuous = false;
  let final = "";
  r.onresult = (e: any) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t; else interim += t;
    }
    o.onInterim((final + interim).trim());
  };
  r.onerror = (e: any) => o.onError?.(e.error ?? "error");
  r.onend = () => { if (final.trim()) o.onFinal(final.trim()); o.onEnd(); };
  r.start();
  return { stop: () => r.stop(), abort: () => { r.onend = () => o.onEnd(); r.abort(); } };
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

/**
 * Speaks a reply as it streams: each finished sentence is queued once.
 * `pulse()` reports word boundaries so the orb can move with the voice.
 */
export function createSpeaker(o: { onStart: () => void; onEnd: () => void; onWord: () => void }) {
  let spoken = 0;
  let pending = 0;
  let cancelled = false;
  const say = (text: string) => {
    if (!text.trim() || cancelled) return;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = chosen ?? pickVoice();
    u.rate = 1.0;
    u.pitch = 0.95;
    u.onstart = () => { o.onStart(); o.onWord(); };
    u.onboundary = () => o.onWord();
    u.onend = u.onerror = () => { pending--; if (pending <= 0 && !cancelled) o.onEnd(); };
    pending++;
    speechSynthesis.speak(u);
  };
  return {
    /** Feed the reply-so-far; speaks complete sentences not yet spoken. */
    feed(full: string, done = false) {
      const rest = full.slice(spoken);
      const m = done ? rest.length : (() => { const r = /[.!?](\s|$)(?![\s\S]*[.!?](\s|$))/.exec(rest); return r ? r.index + 1 : 0; })();
      if (m > 0) { say(rest.slice(0, m).replace(/[*#`_]/g, "")); spoken += m; }
      if (done && pending === 0 && !cancelled) o.onEnd();
    },
    cancel() { cancelled = true; speechSynthesis.cancel(); },
  };
}
