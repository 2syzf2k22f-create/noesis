// Panels that slide in around the orb. Pinned ones are remembered on this device.

export type PanelKind = "spaces" | "style" | "orb" | "inbox" | "stats" | "apollo" | "widget";
export type Panel = {
  id: string; kind: PanelKind; title: string; widget?: string;
  x: number; y: number; w: number; h: number; pinned: boolean; slot: "left" | "right" | "bottom";
};

const KEY = "noesis.panels";
const EMPTY: Panel[] = [];
const DEFS: Record<PanelKind, { title: string; slot: Panel["slot"]; w: number; h: number }> = {
  spaces: { title: "Spaces", slot: "left", w: 300, h: 470 },
  stats: { title: "Stats", slot: "left", w: 320, h: 300 },
  style: { title: "Style", slot: "right", w: 300, h: 380 },
  inbox: { title: "Inbox", slot: "right", w: 340, h: 420 },
  orb: { title: "Orb states", slot: "bottom", w: 520, h: 112 },
  apollo: { title: "Apollo", slot: "right", w: 340, h: 520 },
  widget: { title: "Widget", slot: "right", w: 380, h: 340 },
};
export const PANEL_KINDS = (Object.keys(DEFS) as PanelKind[]).filter((k) => k !== "widget");
export const panelTitle = (k: PanelKind) => DEFS[k].title;

let panels: Panel[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function clamp(p: Panel): Panel {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(p.w, vw - 16), h = Math.min(p.h, vh - 16);
  return { ...p, w, h, x: Math.max(8, Math.min(p.x, vw - w - 8)), y: Math.max(8, Math.min(p.y, vh - h - 8)) };
}

function load() {
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as Panel[];
    if (Array.isArray(raw) && raw.length) panels = raw.filter((p) => DEFS[p.kind]).map(clamp);
  } catch {}
}

function commit(next: Panel[]) {
  panels = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next.filter((p) => p.pinned)));
  } catch {}
  listeners.forEach((fn) => fn());
}

export const panelStore = {
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  get() { if (!loaded) load(); return panels; },
  getServer() { return EMPTY; },
  open(kind: PanelKind, widget?: string, title?: string) {
    const pid = widget ? `widget:${widget}` : kind;
    const existing = panels.find((p) => p.id === pid);
    if (existing) return commit([...panels.filter((p) => p !== existing), existing]); // bring to front
    const d = DEFS[kind], vw = window.innerWidth, vh = window.innerHeight;
    const n = panels.filter((p) => p.slot === d.slot).length * 26;
    const x = d.slot === "left" ? 24 + n : d.slot === "right" ? vw - d.w - 24 - n : (vw - d.w) / 2;
    const y = d.slot === "bottom" ? vh - d.h - 176 - n : Math.max(24, (vh - d.h) / 2 - 30 + n);
    commit([...panels, clamp({ id: pid, kind, widget, title: title ?? d.title, slot: d.slot, x, y, w: d.w, h: d.h, pinned: false })]);
  },
  close(id: string) { commit(panels.filter((p) => p.id !== id)); },
  /** Leaving the orb: only pinned panels follow you to other pages. */
  closeUnpinned() {
    if (panels.some((p) => !p.pinned)) commit(panels.filter((p) => p.pinned));
  },
  closeTop() {
    const top = [...panels].reverse().find((p) => !p.pinned);
    if (top) commit(panels.filter((p) => p !== top));
    return !!top;
  },
  update(id: string, patch: Partial<Panel>) {
    commit(panels.map((p) => (p.id === id ? clamp({ ...p, ...patch }) : p)));
  },
  front(id: string) {
    const p = panels.find((q) => q.id === id);
    if (p && panels[panels.length - 1] !== p) commit([...panels.filter((q) => q !== p), p]);
  },
};
