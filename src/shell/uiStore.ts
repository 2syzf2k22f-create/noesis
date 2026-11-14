"use client";
// On-screen things Apollo (and you) can control: the chatbox's place and size, highlights
// pointing at elements, and pages open side by side.

import { useSyncExternalStore } from "react";

export type Box = { x: number; y: number; w: number; h: number };
export type Highlight = { id: number; target: string; label?: string; until: number };
/** A snap zone as fractions of the screen (so snapped windows line up exactly at any size). */
export type Frac = { x: number; y: number; w: number; h: number };
/** One floating side-by-side window: the page it shows now (it navigates on its own), where it is, and its stacking. */
export type Win = { page: string; box: Box | null; snap: Frac | null; z: number };
type State = { chat: { open: boolean; box: Box | null }; highlights: Highlight[]; windows: string[]; wins: Record<string, Win> };

const KEY = "noesis.ui";
let st: State = { chat: { open: false, box: null }, highlights: [], windows: [], wins: {} };
let ztop = 1;
let loaded = false;
const subs = new Set<() => void>();
const SERVER: State = st;
let hid = 0;

function get() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      const j = JSON.parse(localStorage.getItem(KEY) ?? "{}");
      const windows: string[] = Array.isArray(j.windows) ? j.windows.slice(0, 4) : [];
      const wins: Record<string, Win> = {};
      for (const w of windows) wins[w] = { page: j.wins?.[w]?.page ?? w, box: j.wins?.[w]?.box ?? null, snap: j.wins?.[w]?.snap ?? null, z: j.wins?.[w]?.z ?? 1 };
      ztop = Math.max(1, ...Object.values(wins).map((w) => w.z));
      st = { ...st, windows, wins, chat: { open: false, box: j.box ?? null } };
    } catch {}
  }
  return st;
}
function commit(next: State) {
  st = next;
  try { localStorage.setItem(KEY, JSON.stringify({ windows: st.windows, wins: st.wins, box: st.chat.box })); } catch {}
  subs.forEach((f) => f());
}

/** Find an element from visible text or a CSS selector. */
export function findTarget(t: string): HTMLElement | null {
  const q = t.trim();
  if (/^[#.[]|^[a-z]+\[|[=>:]/i.test(q)) { try { const el = document.querySelector<HTMLElement>(q); if (el) return el; } catch {} }
  const want = q.toLowerCase();
  const cands = [...document.querySelectorAll<HTMLElement>("[data-ui=block-head], h1, h2, h3, button, a, label, th, [data-window-title], li, span, p, b, td, div")]
    .filter((el) => el.offsetParent !== null && !el.closest("[data-chatdock]"));
  const own = (el: HTMLElement) => (el.innerText ?? "").trim().toLowerCase();
  const exact = cands.filter((el) => own(el) === want);
  const pick = (els: HTMLElement[]) => els.sort((a, b) => own(a).length - own(b).length || a.getBoundingClientRect().width - b.getBoundingClientRect().width)[0];
  let el = pick(exact) ?? pick(cands.filter((el) => own(el).includes(want) && own(el).length < want.length + 80));
  if (el?.matches("[data-ui=block-head]")) el = (el.closest("[data-ui=block]") as HTMLElement) ?? el;
  return el ?? null;
}

export const uiStore = {
  get, subscribe(f: () => void) { subs.add(f); return () => { subs.delete(f); }; },
  setChat(patch: Partial<State["chat"]>) { commit({ ...get(), chat: { ...get().chat, ...patch } }); },
  highlight(target: string, label?: string, ms = 9000) {
    const h = { id: ++hid, target, label, until: Date.now() + ms };
    commit({ ...get(), highlights: [...get().highlights.filter((x) => x.target !== target), h] });
    setTimeout(() => uiStore.unhighlight(h.id), ms);
  },
  unhighlight(id: number) { commit({ ...get(), highlights: get().highlights.filter((h) => h.id !== id) }); },
  openWindow(to: string) {
    const cur = get();
    // already open (by id or by the page it's showing): just bring it to the front
    const have = cur.windows.find((x) => x === to || cur.wins[x]?.page === to);
    if (have) { uiStore.focusWindow(have); return; }
    const windows = [...cur.windows, to].slice(-4);
    const wins: Record<string, Win> = {};
    for (const w of windows) wins[w] = cur.wins[w] ?? { page: w, box: null, snap: null, z: ++ztop };
    commit({ ...cur, windows, wins });
  },
  closeWindow(to?: string) {
    const cur = get();
    if (!to) { commit({ ...cur, windows: [], wins: {} }); return; }
    const windows = cur.windows.filter((x) => x !== to && cur.wins[x]?.page !== to);
    const wins = Object.fromEntries(windows.map((w) => [w, cur.wins[w]]));
    commit({ ...cur, windows, wins });
  },
  /** Change one window only (its page, position, snap). */
  updateWindow(id: string, patch: Partial<Win>) {
    const cur = get(), w = cur.wins[id];
    if (!w) return;
    commit({ ...cur, wins: { ...cur.wins, [id]: { ...w, ...patch } } });
  },
  focusWindow(id: string) {
    const w = get().wins[id];
    if (w && w.z !== ztop) uiStore.updateWindow(id, { z: ++ztop });
  },
  /** Put the chatbox next to an element (right of it if there's room, else left, else below). */
  placeNear(target: string, size?: { w?: number; h?: number }) {
    const el = findTarget(target);
    if (!el) return false;
    const r = el.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight;
    const w = size?.w ?? get().chat.box?.w ?? 380, h = size?.h ?? get().chat.box?.h ?? 420;
    let x = r.right + 14, y = Math.max(8, Math.min(r.top, vh - h - 8));
    if (x + w > vw - 8) x = r.left - w - 14;
    if (x < 8) { x = Math.max(8, Math.min(r.left, vw - w - 8)); y = Math.min(vh - h - 8, r.bottom + 12); }
    commit({ ...get(), chat: { open: true, box: { x, y, w, h } } });
    return true;
  },
};

export function useUi() {
  return useSyncExternalStore(uiStore.subscribe, get, () => SERVER);
}
