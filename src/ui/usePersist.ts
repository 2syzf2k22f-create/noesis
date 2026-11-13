"use client";
// State that survives moving between pages (and reloads in the same tab), and is cleared when
// the site/tab is closed. Used for games, boards, reviews and practice runs in progress.

import { useCallback, useEffect, useRef, useState } from "react";

const mem = new Map<string, unknown>();
const KEY = (k: string) => `noesis.keep.${k}`;

export function usePersist<T>(key: string, init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => (mem.has(key) ? (mem.get(key) as T) : typeof init === "function" ? (init as () => T)() : init));
  const restored = useRef(mem.has(key));
  // after a reload, bring back what this tab had
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const j = sessionStorage.getItem(KEY(key));
      if (j != null) { const x = JSON.parse(j) as T; mem.set(key, x); queueMicrotask(() => setV(x)); }
    } catch {}
  }, [key]);
  const set = useCallback((x: T | ((p: T) => T)) => {
    setV((prev) => {
      const next = typeof x === "function" ? (x as (p: T) => T)(prev) : x;
      mem.set(key, next);
      try { if (next == null) sessionStorage.removeItem(KEY(key)); else sessionStorage.setItem(KEY(key), JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);
  return [v, set];
}
