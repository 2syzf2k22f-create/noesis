"use client";
// The toolbar each side-by-side pane gets (Back, Recent, Pages, Style, Focus). Its buttons act on
// that pane only; labels collapse to icons when the pane is narrow (container query in dock.module.css).

import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import { SPACES } from "./spaces";
import s from "./dock.module.css";

type Recent = { path: string; title: string };
const recent = (): Recent[] => { try { return JSON.parse(localStorage.getItem("noesis.recent") ?? "[]"); } catch { return []; } };

export function PaneToolbar({ canBack, onBack, onOpen, current }: { canBack: boolean; onBack: () => void; onOpen: (href: string) => void; current?: string }) {
  const [open, setOpen] = useState<"recent" | "pages" | "style" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { preset, presets, setTheme } = useTheme();
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    window.addEventListener("pointerdown", down);
    return () => window.removeEventListener("pointerdown", down);
  }, [open]);
  const go = (href: string) => { setOpen(null); onOpen(href); };
  const btn = (k: "recent" | "pages" | "style", icon: string, label: string) => (
    <button className={s.paneBtn} data-on={open === k} onClick={() => setOpen(open === k ? null : k)} title={label} aria-label={label}><i>{icon}</i><span>{label}</span></button>
  );
  return (
    <div className={s.paneTools} ref={ref} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      {canBack && <button className={s.paneBtn} onClick={onBack} title="Back (this pane)" aria-label="Back"><i>←</i><span>Back</span></button>}
      {btn("recent", "↺", "Recent")}
      {btn("pages", "☰", "Pages")}
      {btn("style", "◐", "Style")}
      <button className={s.paneBtn} onClick={() => window.dispatchEvent(new CustomEvent("noesis:focus-menu"))} title="Focus timer" aria-label="Focus"><i>◷</i><span>Focus</span></button>
      {open && (
        <div className={s.paneMenu} role="menu">
          {open === "recent" && (recent().filter((r) => r.path !== current).slice(0, 10).map((r) => <button key={r.path} onClick={() => go(r.path)}>{r.title}</button>))}
          {open === "recent" && recent().filter((r) => r.path !== current).length === 0 && <span className="label">No recent pages yet.</span>}
          {open === "pages" && SPACES.map((sp) => (
            <div key={sp.id}>
              <button onClick={() => go(`/s/${sp.id}`)}><b>{sp.name}</b></button>
              {sp.subs?.map((x) => <button key={x.id} onClick={() => go(`/s/${sp.id}/${x.id}`)} style={{ paddingLeft: 18 }}>{x.name}</button>)}
            </div>
          ))}
          {open === "style" && presets.map((p) => (
            <button key={p.id} onClick={() => { setTheme(p.id); setOpen(null); }} aria-current={p.id === preset.id}>
              <i style={{ display: "inline-block", width: 12, height: 12, borderRadius: 3, marginRight: 8, background: `linear-gradient(135deg, ${p.swatch[1]}, ${p.swatch[2]})` }} />{p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
