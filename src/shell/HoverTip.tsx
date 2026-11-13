"use client";
// One shared, instant tooltip for anything with a data-tip attribute (chart bars, points, slices, cells).

import { useEffect, useState } from "react";

export function HoverTip() {
  const [t, setT] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-tip]") as HTMLElement | SVGElement | null;
      const text = el?.getAttribute("data-tip");
      setT(text ? { text, x: e.clientX, y: e.clientY } : null);
    };
    const leave = () => setT(null);
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("scroll", leave, { passive: true });
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("scroll", leave); };
  }, []);
  if (!t) return null;
  const left = Math.min(t.x + 14, (typeof window !== "undefined" ? window.innerWidth : 1200) - 240);
  return (
    <div role="tooltip" style={{ position: "fixed", left, top: t.y + 16, zIndex: 100, pointerEvents: "none", padding: "5px 9px", borderRadius: 7, background: "var(--text)", color: "var(--bg)", font: "600 12px var(--font-body), sans-serif", maxWidth: 230, boxShadow: "0 6px 18px rgba(0,0,0,.35)" }}>
      {t.text}
    </div>
  );
}
