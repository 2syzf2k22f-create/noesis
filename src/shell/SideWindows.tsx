"use client";
// Side-by-side pages as floating windows over the current page: drag by the title bar, resize from
// any edge or corner, snap into layouts (halves, thirds, quarters, mixed) like Windows 11, and each
// window navigates on its own (a link inside a window changes only that window).

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { WinCtx } from "./winNav";
import { getSpace, getSub } from "./spaces";
import { uiStore, useUi, type Box, type Frac, type Win } from "./uiStore";
import { PageLoader } from "@/ui/PageLoader";
import s from "./dock.module.css";

/* ---------- navigation inside a window ---------- */

export function href(to: string) {
  const [sp, sub] = to.split("--");
  return getSpace(sp) ? (sub ? `/s/${sp}/${sub}` : `/s/${sp}`) : `/p/${to}`;
}
/** An in-app page link -> window page id (null for anything else). */
function toId(link: string): string | null {
  let u: URL;
  try { u = new URL(link, location.origin); } catch { return null; }
  if (u.origin !== location.origin) return null;
  const sp = /^\/s\/([^/]+)(?:\/([^/]+))?\/?$/.exec(u.pathname);
  if (sp) return sp[2] ? `${sp[1]}--${sp[2]}` : sp[1];
  const p = /^\/p\/([^/]+)\/?$/.exec(u.pathname);
  return p ? p[1] : null;
}

/* ---------- geometry ---------- */
type View = { w: number; h: number };
let view: View = { w: 1280, h: 800 };
const SERVER_VIEW: View = view;
const subscribeView = (f: () => void) => { window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); };
const getView = () => { if (view.w !== window.innerWidth || view.h !== window.innerHeight) view = { w: window.innerWidth, h: window.innerHeight }; return view; };
const useView = () => useSyncExternalStore(subscribeView, getView, () => SERVER_VIEW);

/** Fractions -> pixels, rounding each EDGE (not the size) so neighbours share edges exactly: no gaps, no overlap. */
const toBox = (f: Frac, v: View): Box => {
  const x = Math.round(f.x * v.w), y = Math.round(f.y * v.h);
  return { x, y, w: Math.round((f.x + f.w) * v.w) - x, h: Math.round((f.y + f.h) * v.h) - y };
};
const T = 1 / 3;
const half = (x: number, y: number, w: number, h: number): Frac => ({ x, y, w, h });
const LAYOUTS: { id: string; name: string; zones: Frac[] }[] = [
  { id: "lr", name: "Left / right", zones: [half(0, 0, 0.5, 1), half(0.5, 0, 0.5, 1)] },
  { id: "tb", name: "Top / bottom", zones: [half(0, 0, 1, 0.5), half(0, 0.5, 1, 0.5)] },
  { id: "thirds", name: "Thirds", zones: [half(0, 0, T, 1), half(T, 0, T, 1), half(2 * T, 0, 1 - 2 * T, 1)] },
  { id: "quarters", name: "Quarters", zones: [half(0, 0, 0.5, 0.5), half(0.5, 0, 0.5, 0.5), half(0, 0.5, 0.5, 0.5), half(0.5, 0.5, 0.5, 0.5)] },
  { id: "l2", name: "Left + two stacked", zones: [half(0, 0, 0.5, 1), half(0.5, 0, 0.5, 0.5), half(0.5, 0.5, 0.5, 0.5)] },
  { id: "2b", name: "Two on top + bottom", zones: [half(0, 0, 0.5, 0.5), half(0.5, 0, 0.5, 0.5), half(0, 0.5, 1, 0.5)] },
];
const FULL = half(0, 0, 1, 1);
const EDGE = 6, CORNER = 48;
/** Screen edges and corners snap too. */
function edgeSnap(px: number, py: number, v: View): Frac | null {
  const L = px <= EDGE, R = px >= v.w - EDGE - 1, Tp = py <= EDGE, B = py >= v.h - EDGE - 1;
  const nearT = py <= CORNER, nearB = py >= v.h - CORNER, nearL = px <= CORNER, nearR = px >= v.w - CORNER;
  if ((L && nearT) || (Tp && nearL)) return half(0, 0, 0.5, 0.5);
  if ((R && nearT) || (Tp && nearR)) return half(0.5, 0, 0.5, 0.5);
  if ((L && nearB) || (B && nearL)) return half(0, 0.5, 0.5, 0.5);
  if ((R && nearB) || (B && nearR)) return half(0.5, 0.5, 0.5, 0.5);
  if (L) return half(0, 0, 0.5, 1);
  if (R) return half(0.5, 0, 0.5, 1);
  if (Tp) return FULL;
  if (B) return half(0, 0.5, 1, 0.5);
  return null;
}
const sameFrac = (a: Frac | null, b: Frac | null) => !!a && !!b && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.w - b.w) < 1e-6 && Math.abs(a.h - b.h) < 1e-6;
const MIN_W = 320, MIN_H = 200;

/* ---------- drag state shared with the snap overlay ---------- */
type Drag = { id: string; target: Frac | null; zone: string | null };

function Window({ id, w, idx, rank, v, onDrag }: { id: string; w: Win; idx: number; rank: number; v: View; onDrag: (d: Drag | null) => void }) {
  const [sp, sub] = w.page.split("--");
  const space = getSpace(sp), x = sub ? getSub(sp, sub) : null;
  const title = x ? `${space?.name} › ${x.name}` : space?.name ?? w.page;
  const narrow = v.w < 1000;
  const fallback: Box = { x: Math.round(v.w / 2) + idx * 28, y: idx * 28, w: Math.round(v.w / 2), h: v.h - idx * 28 };
  const rect: Box = narrow ? { x: 0, y: 0, w: v.w, h: v.h } : w.snap ? toBox(w.snap, v) : clampBox(w.box ?? fallback, v);
  const [live, setLive] = useState<Box | null>(null); // while dragging/resizing
  const [hist, setHist] = useState<string[]>([]);
  const op = useRef<{ kind: "move" | "size"; dir: string; sx: number; sy: number; r: Box; snapped: boolean; moved: boolean; target: Frac | null } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const shown = live ?? rect;

  const go = (page: string) => { if (page === w.page) return; setHist((h) => [...h, w.page].slice(-20)); uiStore.updateWindow(id, { page }); body.current?.scrollTo({ top: 0 }); };
  const startMove = (e: React.PointerEvent) => {
    if (narrow || (e.target as HTMLElement).closest("button,a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    uiStore.focusWindow(id);
    op.current = { kind: "move", dir: "", sx: e.clientX, sy: e.clientY, r: rect, snapped: !!w.snap, moved: false, target: null };
  };
  const startSize = (dir: string) => (e: React.PointerEvent) => {
    if (narrow) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    uiStore.focusWindow(id);
    op.current = { kind: "size", dir, sx: e.clientX, sy: e.clientY, r: rect, snapped: !!w.snap, moved: false, target: null };
  };
  const onMove = (e: React.PointerEvent) => {
    const o = op.current;
    if (!o) return;
    const dx = e.clientX - o.sx, dy = e.clientY - o.sy;
    if (!o.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    o.moved = true;
    if (o.kind === "move") {
      let r = o.r;
      // pulling a snapped window out restores its free size, keeping the grab point under the pointer
      if (o.snapped) {
        const free = w.box ?? { x: 0, y: 0, w: Math.round(v.w / 2), h: Math.round(v.h * 0.8) };
        const fx = (o.sx - o.r.x) / o.r.w;
        r = { x: Math.round(o.sx - fx * free.w), y: o.r.y, w: free.w, h: free.h };
      }
      const next = { ...r, x: r.x + dx, y: Math.max(0, r.y + dy) };
      setLive(next);
      // what's under the pointer: a zone in the snap bar, or a screen edge/corner
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const zone = el?.closest<HTMLElement>("[data-snapzone]")?.dataset.snapzone ?? null;
      let target: Frac | null = null;
      if (zone) { const [li, zi] = zone.split(":").map(Number); target = LAYOUTS[li]?.zones[zi] ?? null; }
      else target = edgeSnap(e.clientX, e.clientY, v);
      o.target = target;
      onDrag({ id, target, zone });
    } else {
      const r = o.r, d = o.dir;
      let { x, y, w: ww, h } = r;
      if (d.includes("e")) ww = Math.max(MIN_W, r.w + dx);
      if (d.includes("s")) h = Math.max(MIN_H, r.h + dy);
      if (d.includes("w")) { ww = Math.max(MIN_W, r.w - dx); x = r.x + r.w - ww; }
      if (d.includes("n")) { h = Math.max(MIN_H, r.h - dy); y = Math.max(0, r.y + r.h - h); }
      setLive({ x, y, w: ww, h });
    }
  };
  const onUp = () => {
    const o = op.current;
    op.current = null;
    onDrag(null);
    if (!o || !o.moved || !live) { setLive(null); return; }
    if (o.kind === "move" && o.target) uiStore.updateWindow(id, { snap: o.target, box: o.snapped ? w.box : rect });
    else uiStore.updateWindow(id, { snap: null, box: clampBox(live, v) });
    setLive(null);
  };
  const toggleMax = () => uiStore.updateWindow(id, sameFrac(w.snap, FULL) ? { snap: null } : { snap: FULL, box: w.snap ? w.box : rect });

  return (
    <section className={s.window} data-window-title={title} data-narrow={narrow}
      style={{ left: shown.x, top: shown.y, width: shown.w, height: shown.h, zIndex: 30 + rank }}
      onPointerDownCapture={() => uiStore.focusWindow(id)}>
      <header className={s.winHead} onPointerDown={startMove} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest("button,a")) toggleMax(); }}>
        {hist.length > 0 && <button onClick={() => { const prev = hist[hist.length - 1]; setHist(hist.slice(0, -1)); uiStore.updateWindow(id, { page: prev }); }} title="Back" aria-label="Back">←</button>}
        <b>{title}</b>
        <span>
          <Link href={href(w.page)} onClick={() => uiStore.closeWindow(id)}>Make main</Link>
          <button onClick={toggleMax} title={sameFrac(w.snap, FULL) ? "Restore" : "Maximise"} aria-label="Maximise">{sameFrac(w.snap, FULL) ? "❐" : "□"}</button>
          <button onClick={() => uiStore.closeWindow(id)} aria-label="Close">✕</button>
        </span>
      </header>
      <div className={s.winBody} ref={body}
        onClickCapture={(e) => {
          // links inside this window open in this window only
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          const a = (e.target as HTMLElement).closest("a");
          if (!a || a.target === "_blank" || !a.getAttribute("href")) return;
          const to = toId(a.href);
          if (!to) return;
          e.preventDefault(); e.stopPropagation();
          go(to);
        }}>
        <WinCtx.Provider value={{ href: href(w.page) }}>
          {space ? (
            x ? <PageLoader key={w.page} slug={w.page} space={sp} fallbackTitle={x.name} blurb={x.blurb} crumb={space.name} />
              : <PageLoader key={w.page} slug={sp} space={space.subs ? sp : undefined} fallbackTitle={space.name} blurb={space.blurb} crumb="Space" />
          ) : <PageLoader key={w.page} slug={w.page} fallbackTitle={w.page} crumb="Page" />}
        </WinCtx.Provider>
      </div>
      {!narrow && ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => (
        <i key={d} className={s.rz} data-dir={d} onPointerDown={startSize(d)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden />
      ))}
    </section>
  );
}

function clampBox(b: Box, v: View): Box {
  const w = Math.min(Math.max(MIN_W, b.w), v.w), h = Math.min(Math.max(MIN_H, b.h), v.h);
  return { w, h, x: Math.min(Math.max(-w + 120, b.x), v.w - 120), y: Math.min(Math.max(0, b.y), v.h - 40) };
}

/** The Windows 11-style layout picker shown at the top while dragging, plus a ghost of where the window will land. */
function SnapOverlay({ drag, v }: { drag: Drag; v: View }) {
  const g = drag.target ? toBox(drag.target, v) : null;
  return (
    <>
      {g && <div className={s.snapGhost} style={{ left: g.x, top: g.y, width: g.w, height: g.h }} />}
      <div className={s.snapBar} role="presentation">
        {LAYOUTS.map((l, li) => (
          <div key={l.id} className={s.snapLayout} title={l.name}>
            {l.zones.map((z, zi) => (
              <i key={zi} data-snapzone={`${li}:${zi}`} data-on={drag.zone === `${li}:${zi}`}
                style={{ left: `${z.x * 100}%`, top: `${z.y * 100}%`, width: `${z.w * 100}%`, height: `${z.h * 100}%` }} />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

export function SideWindows({ children }: { children: React.ReactNode }) {
  const { windows, wins } = useUi();
  const v = useView();
  const [drag, setDrag] = useState<Drag | null>(null);
  // Esc while dragging: nothing to do but hide the overlay
  useEffect(() => { if (!windows.length) queueMicrotask(() => setDrag(null)); }, [windows.length]);
  if (!windows.length) return <>{children}</>;
  const order = [...windows].sort((a, b) => (wins[a]?.z ?? 0) - (wins[b]?.z ?? 0));
  return (
    <>
      {children}
      {windows.map((id, i) => wins[id] && <Window key={id} id={id} w={wins[id]} idx={i} rank={order.indexOf(id)} v={v} onDrag={setDrag} />)}
      {drag && <SnapOverlay drag={drag} v={v} />}
    </>
  );
}
