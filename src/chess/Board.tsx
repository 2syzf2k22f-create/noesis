"use client";

import { Chess, type Square } from "chess.js";
import { useMemo, useState } from "react";
import c from "./chess.module.css";

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const FILES = "abcdefgh";

export type Mark = { label: string; color: string };

/** Click-to-move board. Promotion auto-queens. Pieces are drawn with chess glyphs in the theme's colours. */
export function Board({ fen, orientation = "white", onMove, lastMove, marks, interactive = true, hint }: {
  fen: string; orientation?: "white" | "black"; onMove?: (from: string, to: string) => boolean | void;
  lastMove?: { from: string; to: string } | null; marks?: Record<string, Mark>; interactive?: boolean; hint?: { from: string; to: string } | null;
}) {
  const game = useMemo(() => { try { return new Chess(fen); } catch { return new Chess(); } }, [fen]);
  const [sel, setSel] = useState<string | null>(null);
  const targets = useMemo(() => (sel ? new Set(game.moves({ square: sel as Square, verbose: true }).map((m) => m.to as string)) : new Set<string>()), [sel, game]);
  const board = game.board();
  const rows = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const cols = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const click = (sq: string) => {
    if (!interactive) return;
    const piece = game.get(sq as Square);
    if (sel && targets.has(sq)) { onMove?.(sel, sq); setSel(null); return; }
    setSel(piece && piece.color === game.turn() ? sq : null);
  };
  const inCheck = game.inCheck();
  return (
    <div className={c.board} role="grid" aria-label="Chess board">
      {rows.map((r) => cols.map((f) => {
        const sq = `${FILES[f]}${8 - r}`;
        const p = board[r][f];
        const dark = (r + f) % 2 === 1;
        const mark = marks?.[sq];
        return (
          <button key={sq} className={c.sq} data-dark={dark} data-sel={sel === sq} data-last={!!lastMove && (lastMove.from === sq || lastMove.to === sq)}
            data-hint={!!hint && (hint.from === sq || hint.to === sq)} data-check={inCheck && p?.type === "k" && p.color === game.turn()}
            onClick={() => click(sq)} aria-label={`${sq}${p ? ` ${p.color === "w" ? "white" : "black"} ${p.type}` : ""}`}>
            {p && <span className={c.piece} data-color={p.color}>{GLYPH[p.type]}</span>}
            {targets.has(sq) && <i className={c.dot} data-capture={!!p} />}
            {mark && <b className={c.mark} style={{ background: mark.color }}>{mark.label}</b>}
            {f === cols[0] && <small className={c.rank}>{8 - r}</small>}
            {r === rows[7] && <small className={c.file}>{FILES[f]}</small>}
          </button>
        );
      }))}
    </div>
  );
}

export function EvalBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className={c.evalBar} title={label}>
      <i style={{ height: `${pct}%` }} />
      <span data-top={pct < 50}>{label}</span>
    </div>
  );
}
