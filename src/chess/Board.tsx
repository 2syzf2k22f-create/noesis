"use client";
// The chess board: drag-and-drop or click-to-move, promotion picker, right-click arrows and
// square highlights (like chess.com), move animation and sounds, piece/board styles, and
// annotations Apollo can draw (arrows, highlighted squares) when explaining a position.

import { Chess, type Square } from "chess.js";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BOARDS, chessStyle, PIECE_SETS, pieceSrc, playSound, useChessStyle } from "./style";
import c from "./chess.module.css";

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";

export type Mark = { label: string; color: string };
export type Arrow = { from: string; to: string; color?: string };

/* ---- annotations drawn by Apollo (via the annotate_board tool) ---- */
type Annot = { arrows: Arrow[]; squares: Record<string, string>; fen?: string; note?: string };
let annot: Annot | null = null;
const annotSubs = new Set<() => void>();
export const boardAnnotations = {
  set(a: Annot | null) { annot = a; annotSubs.forEach((f) => f()); },
  get: () => annot,
  subscribe(f: () => void) { annotSubs.add(f); return () => { annotSubs.delete(f); }; },
};
/* ---- walkthroughs: Apollo steps through positions on the board while explaining ---- */
export type WalkStep = { fen: string; say: string; arrows?: Arrow[]; squares?: Record<string, string>; lastMove?: { from: string; to: string } };
type Walk = { title?: string; steps: WalkStep[]; i: number } | null;
let walk: Walk = null;
const walkSubs = new Set<() => void>();
export const boardWalk = {
  set(w: Walk) { walk = w; walkSubs.forEach((f) => f()); },
  get: () => walk,
  step(d: number) { if (walk) boardWalk.set({ ...walk, i: Math.max(0, Math.min(walk.steps.length - 1, walk.i + d)) }); },
  subscribe(f: () => void) { walkSubs.add(f); return () => { walkSubs.delete(f); }; },
};
let walkSpeak: ((text: string) => void) | null = null;
/** The shell plugs in speech so each step is read out. */
export const setWalkSpeaker = (f: ((text: string) => void) | null) => { walkSpeak = f; };

const sameFen = (a: string, b: string) => a.split(" ").slice(0, 4).join(" ") === b.split(" ").slice(0, 4).join(" ");

const ARROW = { green: "rgba(21, 120, 27, 0.8)", orange: "rgba(255, 170, 0, 0.82)", red: "rgba(222, 50, 40, 0.8)", blue: "rgba(0, 110, 220, 0.75)", user: "rgba(255, 170, 0, 0.85)" };
const arrowColor = (k?: string) => (k && k in ARROW ? ARROW[k as keyof typeof ARROW] : k ?? ARROW.green);

export function Board({ fen: ownFen, orientation = "white", onMove, lastMove: lastMoveIn, marks: marksIn, interactive = true, hint: hintIn, arrows: arrowsIn, squares: squaresIn, showAnnotations = true }: {
  fen: string; orientation?: "white" | "black"; onMove?: (from: string, to: string, promotion?: string) => boolean | void;
  lastMove?: { from: string; to: string } | null; marks?: Record<string, Mark>; interactive?: boolean; hint?: { from: string; to: string } | null;
  arrows?: Arrow[]; squares?: Record<string, string>; showAnnotations?: boolean;
}) {
  const style = useChessStyle();
  const apollo = useSyncExternalStore(boardAnnotations.subscribe, boardAnnotations.get, () => null);
  const w = useSyncExternalStore(boardWalk.subscribe, boardWalk.get, () => null);
  const ws = showAnnotations && w ? w.steps[w.i] : null;
  const fen = ws?.fen ?? ownFen;
  const arrows = ws ? ws.arrows ?? [] : arrowsIn, squares = ws ? ws.squares ?? {} : squaresIn;
  const lastMove = ws ? ws.lastMove ?? null : lastMoveIn, marks = ws ? undefined : marksIn, hint = ws ? null : hintIn;
  // read each step out as it appears
  useEffect(() => { if (ws?.say) walkSpeak?.(ws.say); }, [ws]); // eslint-disable-line react-hooks/exhaustive-deps
  const game = useMemo(() => { try { return new Chess(fen); } catch { return new Chess(); } }, [fen]);
  const [sel, setSel] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; x: number; y: number; moved: boolean; size: number } | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [userArrows, setUserArrows] = useState<Arrow[]>([]);
  const [userSquares, setUserSquares] = useState<Record<string, string>>({});
  const right = useRef<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const draggedTo = useRef<string | null>(null);
  const prevFen = useRef(fen);
  const [anim, setAnim] = useState<{ to: string; dx: number; dy: number; key: string } | null>(null);

  const flip = orientation === "black";
  const board = game.board();
  const legal = (from: string) => new Set(game.moves({ square: from as Square, verbose: true }).map((m) => m.to as string));
  const targets = useMemo(() => (sel ? legal(sel) : new Set<string>()), [sel, game]); // eslint-disable-line react-hooks/exhaustive-deps

  // new position: clear your own arrows, animate the last move, play a sound
  useEffect(() => {
    if (prevFen.current === fen) return;
    const before = prevFen.current;
    prevFen.current = fen;
    queueMicrotask(() => { setUserArrows([]); setUserSquares({}); setSel(null); setPromo(null); });
    if (!lastMove) return;
    const capture = (before.split(" ")[0].match(/[a-z]/gi)?.length ?? 0) > (fen.split(" ")[0].match(/[a-z]/gi)?.length ?? 0);
    const g = new Chess(fen);
    playSound(g.isGameOver() ? "end" : g.inCheck() ? "check" : capture ? "capture" : "move");
    if (style.animate && draggedTo.current !== lastMove.to) {
      const [fx, fy] = xy(lastMove.from, flip), [tx, ty] = xy(lastMove.to, flip);
      queueMicrotask(() => setAnim({ to: lastMove.to, dx: fx - tx, dy: fy - ty, key: fen }));
    }
    draggedTo.current = null;
  }, [fen]); // eslint-disable-line react-hooks/exhaustive-deps

  const squareAt = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const fx = Math.floor(((clientX - r.left) / r.width) * 8), fy = Math.floor(((clientY - r.top) / r.height) * 8);
    if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
    return flip ? `${FILES[7 - fx]}${fy + 1}` : `${FILES[fx]}${8 - fy}`;
  };
  const tryMove = (from: string, to: string) => {
    if (!legal(from).has(to)) { if (from !== to) playSound("illegal"); return false; }
    const p = game.get(from as Square);
    if (p?.type === "p" && (to[1] === "8" || to[1] === "1")) { setPromo({ from, to }); return true; }
    onMove?.(from, to);
    return true;
  };

  const down = (e: React.PointerEvent) => {
    const sq = squareAt(e.clientX, e.clientY);
    if (!sq) return;
    if (e.button === 2) { right.current = sq; return; }
    if (e.button !== 0) return;
    setUserArrows([]); setUserSquares({});
    if (showAnnotations && apollo) boardAnnotations.set(null);
    if (!interactive || promo) return;
    const piece = game.get(sq as Square);
    if (sel && sel !== sq && targets.has(sq)) { tryMove(sel, sq); setSel(null); return; }
    if (piece && piece.color === game.turn()) {
      setSel(sq);
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ from: sq, x: e.clientX, y: e.clientY, moved: false, size: ref.current!.getBoundingClientRect().width / 8 });
    } else setSel(null);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved: drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 3 });
  };
  const up = (e: React.PointerEvent) => {
    const sq = squareAt(e.clientX, e.clientY);
    if (e.button === 2) {
      const from = right.current;
      right.current = null;
      if (!from || !sq) return;
      const color = e.shiftKey ? ARROW.green : e.altKey ? ARROW.blue : e.ctrlKey ? ARROW.red : ARROW.user;
      if (from === sq) setUserSquares((s) => { const n = { ...s }; if (n[sq]) delete n[sq]; else n[sq] = "rgba(235, 97, 80, 0.8)"; return n; });
      else setUserArrows((as) => as.some((a) => a.from === from && a.to === sq) ? as.filter((a) => !(a.from === from && a.to === sq)) : [...as, { from, to: sq, color }]);
      return;
    }
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!sq || sq === d.from) return; // a click: keep the selection
    if (d.moved) { draggedTo.current = sq; if (tryMove(d.from, sq)) setSel(null); }
  };

  const inCheck = game.inCheck();
  const rows = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const cols = flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const theme = BOARDS.find((b) => b.id === style.board) ?? BOARDS[0];
  const vars = theme.id === "theme" ? {} : ({ "--sq-light": theme.light, "--sq-dark": theme.dark } as React.CSSProperties);
  const ap = showAnnotations && apollo && (!apollo.fen || sameFen(apollo.fen, fen)) ? apollo : null;
  const allArrows: Arrow[] = [
    ...(style.arrows && hint ? [{ ...hint, color: "green" }] : []),
    ...(style.arrows ? arrows ?? [] : []),
    ...(ap?.arrows ?? []), ...userArrows,
  ];
  const allSquares = { ...(squares ?? {}), ...(ap?.squares ?? {}), ...userSquares };
  const piece = (color: "w" | "b", type: string) =>
    style.pieces === "glyph"
      ? <span className={c.glyph} data-color={color}>{GLYPH[type]}</span>
      : <img className={c.pimg} src={pieceSrc(style.pieces, color, type)} alt="" draggable={false} />;

  return (
    <div className={c.boardWrap}>
      <div ref={ref} className={c.board} style={vars} data-theme-board={theme.id === "theme"} role="grid" aria-label="Chess board"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onContextMenu={(e) => e.preventDefault()}>
        {rows.map((r) => cols.map((f) => {
          const sq = `${FILES[f]}${8 - r}`;
          const p = board[r][f];
          const dark = (r + f) % 2 === 1;
          const mark = marks?.[sq];
          const isDragged = drag?.moved && drag.from === sq;
          const a = anim && anim.to === sq ? anim : null;
          return (
            <div key={sq} className={c.sq} data-dark={dark} data-sel={sel === sq} data-last={!!lastMove && (lastMove.from === sq || lastMove.to === sq)}
              data-check={inCheck && p?.type === "k" && p.color === game.turn()} data-sq={sq}
              aria-label={`${sq}${p ? ` ${p.color === "w" ? "white" : "black"} ${p.type}` : ""}`}>
              {allSquares[sq] && <i className={c.sqMark} style={{ background: allSquares[sq] }} />}
              {style.coords === "inside" && f === cols[0] && <small className={c.rank}>{8 - r}</small>}
              {style.coords === "inside" && r === rows[7] && <small className={c.file}>{FILES[f]}</small>}
              {p && (
                <span key={a?.key ?? "p"} className={c.piece} data-drag={isDragged} data-anim={!!a}
                  style={a ? ({ "--dx": a.dx, "--dy": a.dy } as React.CSSProperties) : undefined}>
                  {piece(p.color, p.type)}
                </span>
              )}
              {targets.has(sq) && <i className={c.dot} data-capture={!!p} />}
              {mark && <b className={c.mark} style={{ background: mark.color }}>{mark.label}</b>}
            </div>
          );
        }))}
        <svg className={c.arrows} viewBox="0 0 8 8" aria-hidden>
          {allArrows.map((a, i) => <ArrowPath key={`${a.from}${a.to}${i}`} a={a} flip={flip} />)}
        </svg>
        {promo && (
          <div className={c.promo} style={{ left: `${xy(promo.to, flip)[0] * 12.5}%`, [game.turn() === (flip ? "b" : "w") ? "top" : "bottom"]: 0 }}>
            {["q", "n", "r", "b"].map((t) => (
              <button key={t} onPointerDown={(e) => e.stopPropagation()} onClick={() => { const p2 = promo; setPromo(null); setSel(null); onMove?.(p2.from, p2.to, t); }}>
                {piece(game.turn(), t)}
              </button>
            ))}
            <button className={c.promoX} onPointerDown={(e) => e.stopPropagation()} onClick={() => setPromo(null)}>✕</button>
          </div>
        )}
      </div>
      {drag?.moved && (() => {
        const p = game.get(drag.from as Square);
        const size = drag.size;
        return p ? <span className={c.ghost} style={{ left: drag.x - size / 2, top: drag.y - size / 2, width: size, height: size }}>{piece(p.color, p.type)}</span> : null;
      })()}
      {ap?.note && !ws && <div className={c.annotNote}><b>Apollo</b> {ap.note}</div>}
      {ws && w && (
        <div className={c.annotNote} style={{ display: "grid", gap: 6 }}>
          <div><b>Apollo{w.title ? ` · ${w.title}` : ""}</b> <span className="label">step {w.i + 1} of {w.steps.length}</span></div>
          <div>{ws.say}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="pill" disabled={w.i === 0} onClick={() => boardWalk.step(-1)}>◀ Back</button>
            <button className="pill" data-active="true" disabled={w.i >= w.steps.length - 1} onClick={() => boardWalk.step(1)}>Next ▶</button>
            <button className="pill" onClick={() => boardWalk.set(null)}>✕ Back to my board</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Square centre in board units (0-8), from White's or Black's side. */
function xy(sq: string, flip: boolean): [number, number] {
  const f = FILES.indexOf(sq[0]), r = Number(sq[1]);
  return flip ? [7 - f, r - 1] : [f, 8 - r];
}

function ArrowPath({ a, flip }: { a: Arrow; flip: boolean }) {
  const [x1, y1] = xy(a.from, flip), [x2, y2] = xy(a.to, flip);
  const s = { x: x1 + 0.5, y: y1 + 0.5 }, e = { x: x2 + 0.5, y: y2 + 0.5 };
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  const color = arrowColor(a.color);
  const knight = (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
  const pts = knight ? [s, dy > dx ? { x: s.x, y: e.y } : { x: e.x, y: s.y }, e] : [s, e];
  // shorten the end so the head lands inside the target square
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const len = Math.hypot(last.x - prev.x, last.y - prev.y), ux = (last.x - prev.x) / len, uy = (last.y - prev.y) / len;
  const head = 0.42, tip = { x: last.x - ux * 0.08, y: last.y - uy * 0.08 };
  const base = { x: tip.x - ux * head, y: tip.y - uy * head };
  const start = { x: s.x + (pts[1].x - s.x) / Math.hypot(pts[1].x - s.x, pts[1].y - s.y) * 0.25, y: s.y + (pts[1].y - s.y) / Math.hypot(pts[1].x - s.x, pts[1].y - s.y) * 0.25 };
  const line = [start, ...pts.slice(1, -1), base].map((p) => `${p.x},${p.y}`).join(" ");
  const w = 0.2;
  return (
    <g opacity={0.9}>
      <polyline points={line} fill="none" stroke={color} strokeWidth={w} strokeLinejoin="round" />
      <polygon points={`${tip.x},${tip.y} ${base.x - uy * w * 1.6},${base.y + ux * w * 1.6} ${base.x + uy * w * 1.6},${base.y - ux * w * 1.6}`} fill={color} />
    </g>
  );
}

export function EvalBar({ pct, label, flip }: { pct: number; label: string; flip?: boolean }) {
  return (
    <div className={c.evalBar} title={label} data-flip={flip}>
      <i style={{ height: `${pct}%` }} />
      <span data-top={pct < 50}>{label}</span>
    </div>
  );
}

/** Piece set and board colour chooser, with live preview. */
export function StylePicker() {
  const s = useChessStyle();
  const [open, setOpen] = useState(false);
  return (
    <div className={c.stylePick}>
      <button className="pill" onClick={() => setOpen(!open)} aria-expanded={open}>Board &amp; pieces</button>
      {open && (
        <div className={c.styleMenu} role="dialog" aria-label="Board and piece style">
          <div className="label">Pieces</div>
          <div className={c.setGrid}>
            {PIECE_SETS.map((p) => (
              <button key={p.id} data-on={s.pieces === p.id} onClick={() => chessStyle.set({ pieces: p.id })} title={p.name}>
                {p.id === "glyph" ? <span className={c.glyph} data-color="w">♞</span> : <img src={pieceSrc(p.id, "w", "n")} alt="" />}
                <small>{p.name}</small>
              </button>
            ))}
          </div>
          <div className="label">Board</div>
          <div className={c.boardGrid}>
            {BOARDS.map((b) => (
              <button key={b.id} data-on={s.board === b.id} onClick={() => chessStyle.set({ board: b.id })} title={b.name}>
                <span className={c.swatch} data-theme-board={b.id === "theme"} style={b.id === "theme" ? undefined : { background: `linear-gradient(135deg, ${b.light} 50%, ${b.dark} 50%)` }} />
                <small>{b.name}</small>
              </button>
            ))}
          </div>
          <label className={c.tog}><input type="checkbox" checked={s.coords === "inside"} onChange={(e) => chessStyle.set({ coords: e.target.checked ? "inside" : "off" })} /> Coordinates</label>
          <label className={c.tog}><input type="checkbox" checked={s.sounds} onChange={(e) => chessStyle.set({ sounds: e.target.checked })} /> Move sounds</label>
          <label className={c.tog}><input type="checkbox" checked={s.animate} onChange={(e) => chessStyle.set({ animate: e.target.checked })} /> Animate moves</label>
          <label className={c.tog}><input type="checkbox" checked={s.arrows} onChange={(e) => chessStyle.set({ arrows: e.target.checked })} /> Best-move arrows</label>
          <small className="label">Right-click drag draws arrows (Shift green, Ctrl red, Alt blue); right-click a square to circle it.</small>
        </div>
      )}
    </div>
  );
}
