"use client";
// Board and piece style, shared by every board on the site and remembered on this device.

import { useSyncExternalStore } from "react";

export const PIECE_SETS = [
  { id: "cburnett", name: "Classic" }, { id: "merida", name: "Merida" }, { id: "california", name: "California" },
  { id: "cardinal", name: "Cardinal" }, { id: "maestro", name: "Maestro" }, { id: "staunty", name: "Staunty" },
  { id: "fresca", name: "Fresca" }, { id: "tatiana", name: "Tatiana" }, { id: "alpha", name: "Alpha" },
  { id: "companion", name: "Companion" }, { id: "chessnut", name: "Chessnut" }, { id: "icpieces", name: "IC" },
  { id: "spatial", name: "Spatial" }, { id: "fantasy", name: "Fantasy" }, { id: "pixel", name: "Pixel" },
  { id: "glyph", name: "Theme glyphs" },
] as const;

export const BOARDS = [
  { id: "green", name: "Green", light: "#ebecd0", dark: "#739552" },
  { id: "brown", name: "Brown", light: "#f0d9b5", dark: "#b58863" },
  { id: "blue", name: "Blue", light: "#dee3e6", dark: "#8ca2ad" },
  { id: "ice", name: "Ice", light: "#e6f0f6", dark: "#7f9fb8" },
  { id: "purple", name: "Purple", light: "#efe6f5", dark: "#8877b7" },
  { id: "coral", name: "Coral", light: "#f4dcd0", dark: "#c98466" },
  { id: "walnut", name: "Walnut", light: "#e8cfa6", dark: "#8d5a33" },
  { id: "slate", name: "Slate", light: "#c9ccd1", dark: "#5d6470" },
  { id: "night", name: "Night", light: "#9aa3b5", dark: "#3e475c" },
  { id: "theme", name: "Match theme", light: "", dark: "" },
] as const;

export type ChessStyle = { pieces: string; board: string; coords: "inside" | "off"; sounds: boolean; animate: boolean; arrows: boolean };
const DEFAULT: ChessStyle = { pieces: "cburnett", board: "green", coords: "inside", sounds: true, animate: true, arrows: true };
const KEY = "noesis.chessStyle";
let cur: ChessStyle = DEFAULT;
let loaded = false;
const subs = new Set<() => void>();

function get() {
  if (!loaded) {
    loaded = true;
    try { cur = { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch {}
  }
  return cur;
}

export const chessStyle = {
  get,
  set(patch: Partial<ChessStyle>) {
    cur = { ...get(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch {}
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
};

export function useChessStyle() {
  return useSyncExternalStore(chessStyle.subscribe, get, () => DEFAULT);
}

export const pieceSrc = (set: string, color: "w" | "b", type: string) => `/pieces/${set}/${color}${type.toUpperCase()}.svg`;

/* ---- sounds: synthesised, no files ---- */
let ac: AudioContext | null = null;
export function playSound(kind: "move" | "capture" | "check" | "end" | "illegal") {
  if (!get().sounds || typeof window === "undefined") return;
  try {
    ac ??= new AudioContext();
    const t = ac.currentTime;
    const tone = (freq: number, at: number, dur: number, vol: number, type: OscillatorType = "triangle") => {
      const o = ac!.createOscillator(), g = ac!.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t + at);
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(vol, t + at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(ac!.destination);
      o.start(t + at); o.stop(t + at + dur + 0.02);
    };
    // a wooden "tock": short noise-like low tone
    if (kind === "move") { tone(420, 0, 0.07, 0.22); tone(180, 0, 0.05, 0.18, "sine"); }
    if (kind === "capture") { tone(520, 0, 0.06, 0.25); tone(300, 0.04, 0.08, 0.22); tone(150, 0, 0.07, 0.2, "sine"); }
    if (kind === "check") { tone(660, 0, 0.09, 0.18, "square"); tone(880, 0.08, 0.12, 0.14, "square"); }
    if (kind === "end") { tone(523, 0, 0.18, 0.16, "sine"); tone(659, 0.15, 0.18, 0.16, "sine"); tone(784, 0.3, 0.3, 0.16, "sine"); }
    if (kind === "illegal") tone(140, 0, 0.12, 0.2, "sawtooth");
  } catch {}
}
