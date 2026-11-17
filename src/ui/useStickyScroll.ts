"use client";
// Keep a chat scrolled to the newest message ONLY while you're already at the bottom. Scroll up to read
// and it stays where you put it (no snapping back as the reply streams); a "Jump to latest" shows instead.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export function useStickyScroll<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const atBottom = useRef(true);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const f = () => { const b = el.scrollHeight - el.scrollTop - el.clientHeight < 60; atBottom.current = b; setAway(!b); };
    el.addEventListener("scroll", f, { passive: true });
    return () => el.removeEventListener("scroll", f);
  }, []);
  useLayoutEffect(() => { if (atBottom.current) ref.current?.scrollTo({ top: 1e9 }); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const jump = useCallback(() => { atBottom.current = true; setAway(false); ref.current?.scrollTo({ top: 1e9, behavior: "smooth" }); }, []);
  return { ref, away, jump };
}
