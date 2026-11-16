"use client";
// Browser voice: speech recognition (STT) and speech synthesis (TTS).
// Chrome/Edge send recognition audio to the browser vendor's servers; Safari supports it on
// iOS 14.5+; Firefox has none. Whisper on the relay PC transcribes when the browser can't; Kokoro speaks on-device.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = any;
const Ctor = () => (typeof window === "undefined" ? null : ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null));
export const sttSupported = () => !!Ctor();
export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export type Listener = { stop: () => void; abort: () => void };

/** One utterance: interim text while you talk, final text when you stop. */
export function listenOnce(o: { onInterim: (t: string) => void; onFinal: (t: string) => void; onEnd: () => void; onError?: (e: string) => void }, opts: { untilStopped?: boolean; lang?: string } = {}): Listener | null {
  const C = Ctor();
  if (!C) return null;
  let final = "", interimNow = "", stopping = false, done = false;
  let r: Rec;
  // when you stop, use everything heard, including words the browser hadn't marked final yet
  const finish = () => { if (done) return; done = true; const all = `${final} ${interimNow}`.trim(); if (all) o.onFinal(all); o.onEnd(); };
  const start = () => {
    r = new C();
    r.lang = opts.lang ?? "en-GB";
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
    r.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      o.onError?.(e.error ?? "error");
      // the browser's service is unusable: stop retrying and let the backup transcribe the recording
      if (e.error === "network" || e.error === "service-not-allowed" || e.error === "not-allowed") stopping = true;
    };
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
  // no browser speech service (Firefox, the desktop app): a small offline model listens for the word instead
  if (!C || (typeof window !== "undefined" && (window as any).noesisDesktop)) return offlineWake(word, () => onWake(""));
  let fellBack: Listener | null = null;
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
    r.onerror = (e: any) => { if (e.error === "network" || e.error === "service-not-allowed") { stopped = true; fellBack = offlineWake(word, () => onWake("")); } };
    r.onend = () => { if (!stopped) setTimeout(start, 300); }; // browsers stop after silence; keep it alive
    try { r.start(); } catch {}
  };
  start();
  return { stop: () => { stopped = true; r?.stop(); fellBack?.stop(); }, abort: () => { stopped = true; r?.abort(); fellBack?.abort(); } };
}

/** Offline wake word (Vosk, ~40 MB English model, downloaded once and cached by the browser): only listens for
 *  the one word, entirely on this device, nothing is sent anywhere. */
const VOSK_MODEL = "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz";
let voskModel: Promise<any> | null = null;
export function offlineWake(word: string, onWake: () => void): Listener {
  let stopped = false;
  let cleanup = () => {};
  (async () => {
    const Vosk: any = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/+esm" as string);
    voskModel ??= (Vosk.createModel ?? Vosk.default?.createModel)(VOSK_MODEL);
    const model = await voskModel;
    if (stopped) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const ctx = new AudioContext();
    const rec = new model.KaldiRecognizer(ctx.sampleRate, JSON.stringify([word.toLowerCase(), "[unk]"]));
    let last = 0;
    rec.on("result", (m: any) => { const t = String(m?.result?.text ?? ""); if (t.includes(word.toLowerCase()) && Date.now() - last > 2500) { last = Date.now(); onWake(); } });
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => { try { rec.acceptWaveform(e.inputBuffer); } catch {} };
    src.connect(node); node.connect(ctx.destination);
    cleanup = () => { try { node.disconnect(); src.disconnect(); stream.getTracks().forEach((t) => t.stop()); void ctx.close(); rec.remove?.(); } catch {} };
    if (stopped) cleanup();
  })().catch(() => {});
  return { stop: () => { stopped = true; cleanup(); }, abort: () => { stopped = true; cleanup(); } };
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

/* ---------- Kokoro: a natural neural voice that runs on this device (no account, no PC needed) ---------- */
export const KOKORO_KEY = "noesis.kokoroVoice";
export const KOKORO_VOICES = [["bm_george", "George (British male)"], ["bm_lewis", "Lewis (British male)"], ["bm_daniel", "Daniel (British male)"], ["bm_fable", "Fable (British male)"], ["bf_emma", "Emma (British female)"], ["am_michael", "Michael (American male)"]] as const;
export function kokoroVoice(): string | null { try { return localStorage.getItem(KOKORO_KEY); } catch { return null; } }
export function setKokoroVoice(v: string | null) { try { if (v) localStorage.setItem(KOKORO_KEY, v); else localStorage.removeItem(KOKORO_KEY); } catch {} }
let kokoro: Promise<any> | null = null;
/** Loads the ~90 MB model once (cached by the browser afterwards); WebGPU when available, else WASM. */
export function loadKokoro() {
  kokoro ??= (async () => {
    const m: any = await import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm" as string);
    const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
    return m.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: gpu ? "fp32" : "q8", device: gpu ? "webgpu" : "wasm" });
  })().catch((e) => { kokoro = null; throw e; });
  return kokoro;
}

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
  const kv = o.lang ? null : kokoroVoice(); // language practice keeps native voices
  const useAzure = !kv && !!azure?.configured;
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
  const sayKokoro = (text: string) => {
    pending++;
    const audio = loadKokoro().then((tts) => tts.generate(text, { voice: kv })).then((a: any) => URL.createObjectURL(a.toBlob()));
    chain = chain.then(() => audio.then((url: string) => new Promise<void>((res) => {
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
    if (kv) sayKokoro(text); else if (useAzure) sayAzure(text); else sayBrowser(text);
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

/** Records 16 kHz mono audio while you talk (backup for when the browser's own speech-to-text fails). */
export async function startRecorder(maxSeconds = 90) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  let n = 0;
  proc.onaudioprocess = (e) => { if (n < maxSeconds * 16000) { const d = new Float32Array(e.inputBuffer.getChannelData(0)); chunks.push(d); n += d.length; } };
  src.connect(proc); proc.connect(ctx.destination);
  const close = () => { try { proc.disconnect(); src.disconnect(); } catch {} stream.getTracks().forEach((t) => t.stop()); void ctx.close(); };
  return {
    /** Stop and return 16-bit PCM as base64 (null if it was basically silent). */
    stop(): string | null {
      close();
      const pcm = new Int16Array(n);
      let o = 0, loud = 0;
      for (const c of chunks) for (let i = 0; i < c.length && o < n; i++, o++) { const v = Math.max(-1, Math.min(1, c[i])); pcm[o] = v * 32767; if (Math.abs(v) > 0.04) loud++; }
      if (n < 8000 || loud < 1600) return null; // under half a second, or no speech-level sound
      const bytes = new Uint8Array(pcm.buffer);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    cancel: close,
  };
}
