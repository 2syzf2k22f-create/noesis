"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { DEFAULT_THEME, getPreset, PRESETS, THEME_KEY, type ThemePreset } from "./presets";

type Ctx = {
  preset: ThemePreset;
  presets: ThemePreset[];
  setTheme: (id: string) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

// The active preset lives on <html data-theme>. The inline script in the layout sets it
// before first paint; React just subscribes to it.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
const read = () => document.documentElement.dataset.theme ?? DEFAULT_THEME;
const readServer = () => DEFAULT_THEME;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const id = useSyncExternalStore(subscribe, read, readServer);

  const setTheme = useCallback((next: string) => {
    const p = getPreset(next);
    const el = document.documentElement;
    el.dataset.theme = p.id;
    el.dataset.frame = p.frame;
    el.dataset.nav = p.nav;
    try {
      localStorage.setItem(THEME_KEY, p.id);
    } catch {}
    listeners.forEach((fn) => fn());
  }, []);

  const value = useMemo(
    () => ({ preset: getPreset(id), presets: PRESETS, setTheme }),
    [id, setTheme],
  );
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): Ctx {
  const v = useContext(ThemeCtx);
  if (!v) throw new Error("useTheme outside ThemeProvider");
  return v;
}
