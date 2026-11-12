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
export function pickVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null;
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  const score = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced/i.test(v.name) ? 8 : 0) + (/google uk english|daniel|serena|libby|sonia|ryan|aria|jenny/i.test(v.name) ? 4 : 0) +
    (v.lang === "en-GB" ? 2 : 0) + (v.localService ? 0 : 1);
  chosen = vs.sort((a, b) => score(b) - score(a))[0] ?? null;
  return chosen;
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
    u.rate = 1.04;
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
