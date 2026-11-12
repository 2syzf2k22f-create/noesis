"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DEFAULT_THEME, PRESETS, presetsToCss, THEME_KEY, type OrbTheme, type ThemePreset } from "./presets";

type Ctx = {
  preset: ThemePreset;
  presets: ThemePreset[];
  setTheme: (id: string) => void;
  /** Re-read Apollo's custom themes from the server. */
  reloadThemes: () => Promise<void>;
};

const ThemeCtx = createContext<Ctx | null>(null);
export const CUSTOM_CSS_KEY = "noesis.customcss";
const CUSTOM_KEY = "noesis.custom";

type Custom = { id: string; name: string; tokens: { base: string; css?: Record<string, string>; orb?: Record<string, unknown> } };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge<T>(a: T, b: any): T {
  if (!b || typeof b !== "object") return a;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = Array.isArray(a) ? [...(a as unknown[])] : { ...(a as object) };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) && typeof out[k] === "object" ? deepMerge(out[k], v) : v;
  return out;
}

/** A custom theme = a built-in preset with some tokens overridden. */
export function toPreset(c: Custom): ThemePreset | null {
  const base = PRESETS.find((p) => p.id === c.tokens?.base);
  if (!base) return null;
  const css = { ...base.css, ...(c.tokens.css ?? {}) };
  const orb = deepMerge<OrbTheme>(base.orb, c.tokens.orb ?? {});
  if (css["--bg"]) orb.bg = css["--bg"];
  const accent = css["--accent"] ?? base.swatch[1], accent2 = css["--accent-2"] ?? base.swatch[2];
  return { ...base, skin: base.id, id: c.id, name: c.name, note: `Custom · based on ${base.name}`, css, orb, swatch: [css["--bg"] ?? base.swatch[0], accent, accent2] };
}

// The active preset lives on <html data-theme>; the inline script in the layout sets it before paint.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const read = () => document.documentElement.dataset.theme ?? DEFAULT_THEME;
const readServer = () => DEFAULT_THEME;
const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch {} },
};

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const id = useSyncExternalStore(subscribe, read, readServer);
  const [custom, setCustom] = useState<ThemePreset[]>([]);

  const presets = useMemo(() => [...PRESETS, ...custom], [custom]);

  const apply = useCallback((list: ThemePreset[], next: string) => {
    const p = list.find((x) => x.id === next) ?? PRESETS[0];
    const el = document.documentElement;
    el.dataset.theme = p.id;
    el.dataset.frame = p.frame;
    el.dataset.nav = p.nav;
    el.dataset.skin = p.skin ?? p.id;
    ls.set(THEME_KEY, p.id);
    listeners.forEach((fn) => fn());
  }, []);

  const install = useCallback((rows: Custom[]) => {
    const list = rows.map(toPreset).filter(Boolean) as ThemePreset[];
    const css = presetsToCss(list);
    let tag = document.getElementById("noesis-custom");
    if (!tag) { tag = document.createElement("style"); tag.id = "noesis-custom"; document.head.appendChild(tag); }
    tag.textContent = css;
    ls.set(CUSTOM_CSS_KEY, JSON.stringify({ ids: list.map((p) => [p.id, p.frame, p.nav, p.skin ?? p.id]), css }));
    ls.set(CUSTOM_KEY, JSON.stringify(rows));
    setCustom(list);
    return list;
  }, []);

  const reloadThemes = useCallback(async () => {
    const rows = await fetch("/api/themes").then((r) => (r.ok ? r.json() : [])).catch(() => null);
    if (!Array.isArray(rows)) return;
    const list = install(rows);
    // the saved choice is a custom theme that wasn't known at first paint: apply it now
    const saved = ls.get(THEME_KEY);
    if (saved && saved !== read() && list.some((p) => p.id === saved)) return apply([...PRESETS, ...list], saved);
    // the active custom theme was deleted (e.g. undone): fall back
    const cur = read();
    if (!PRESETS.some((p) => p.id === cur) && !list.some((p) => p.id === cur)) apply(PRESETS, DEFAULT_THEME);
  }, [apply, install]);

  useEffect(() => {
    try {
      const cached = JSON.parse(ls.get(CUSTOM_KEY) ?? "[]");
      if (Array.isArray(cached) && cached.length) queueMicrotask(() => install(cached));
    } catch {}
    queueMicrotask(() => void reloadThemes());
  }, [install, reloadThemes]);

  const setTheme = useCallback((next: string) => {
    if (presets.some((p) => p.id === next)) return apply(presets, next);
    // a theme Apollo just made: fetch, then apply
    void fetch("/api/themes").then((r) => (r.ok ? r.json() : [])).then((rows: Custom[]) => apply([...PRESETS, ...install(rows)], next));
  }, [apply, install, presets]);

  const value = useMemo(
    () => ({ preset: presets.find((p) => p.id === id) ?? PRESETS[0], presets, setTheme, reloadThemes }),
    [id, presets, setTheme, reloadThemes],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
