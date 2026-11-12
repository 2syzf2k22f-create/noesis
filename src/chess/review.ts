// Game review: classify every move like chess.com (brilliant, great, best, excellent, good,
// book, inaccuracy, mistake, miss, blunder) from Stockfish evaluations, computed in code.
import { Chess } from "chess.js";
import { OPENINGS } from "./openings";
import { winPct, type Analysis, type Line } from "./engine";

export type Cls = "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "miss" | "blunder";
export const CLS: Record<Cls, { label: string; sym: string; color: string }> = {
  brilliant: { label: "Brilliant", sym: "!!", color: "#1baca6" },
  great: { label: "Great", sym: "!", color: "#5c8bb0" },
  best: { label: "Best", sym: "★", color: "#81b64c" },
  excellent: { label: "Excellent", sym: "👍", color: "#96bc4b" },
  good: { label: "Good", sym: "✓", color: "#95af8a" },
  book: { label: "Book", sym: "📖", color: "#a88865" },
  inaccuracy: { label: "Inaccuracy", sym: "?!", color: "#f7c631" },
  mistake: { label: "Mistake", sym: "?", color: "#ffa459" },
  miss: { label: "Miss", sym: "✗", color: "#ff7769" },
  blunder: { label: "Blunder", sym: "??", color: "#fa412d" },
};
export const CLS_ORDER: Cls[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];

export type Ply = { san: string; uci: string; color: "w" | "b"; cls: Cls; loss: number; after: Line | undefined; bestSan: string | null; bestLine: string[]; fenBefore: string };
export type Review = { plies: Ply[]; accuracy: { w: number; b: number }; counts: Record<"w" | "b", Partial<Record<Cls, number>>> };

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(fen: string, color: "w" | "b") {
  let s = 0;
  for (const row of new Chess(fen).board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VAL[p.type];
  return s;
}
const toUci = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? "");
function uciLineToSan(fen: string, pv: string[], max = 6) {
  const g = new Chess(fen), out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try { out.push(g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; }
  }
  return out;
}
const bookPrefixes = new Set(OPENINGS.flatMap((o) => { const m = o.moves.split(" "); return m.map((_, i) => m.slice(0, i + 1).join(" ")); }));

/** Final-position "analysis" when the game is over (no engine needed). */
function terminal(fen: string): Line | null {
  const g = new Chess(fen);
  if (g.isCheckmate()) return { cp: null, mate: g.turn() === "w" ? -0.5 : 0.5, pv: [], depth: 0 };
  if (g.isDraw() || g.isStalemate()) return { cp: 0, mate: null, pv: [], depth: 0 };
  return null;
}

export async function reviewGame(sans: string[], analyse: (fen: string) => Promise<Analysis>, onProgress?: (done: number, total: number) => void, startFen?: string): Promise<Review> {
  const g = new Chess(startFen);
  const fens = [g.fen()], moves: { san: string; uci: string; color: "w" | "b" }[] = [];
  for (const s of sans) {
    const color = g.turn();
    const m = g.move(s);
    moves.push({ san: m.san, uci: toUci(m), color });
    fens.push(g.fen());
  }
  const A: Analysis[] = [];
  for (let i = 0; i < fens.length; i++) {
    const t = terminal(fens[i]);
    A.push(t ? { best: null, lines: [t] } : await analyse(fens[i]));
    onProgress?.(i + 1, fens.length);
  }
  const plies: Ply[] = [];
  const acc: Record<"w" | "b", number[]> = { w: [], b: [] };
  const counts: Review["counts"] = { w: {}, b: {} };
  for (let i = 0; i < moves.length; i++) {
    const { san, uci, color } = moves[i];
    const pov = (wp: number) => (color === "w" ? wp : 100 - wp);
    const wpBest = pov(winPct(A[i].lines[0]));
    const wpAfter = pov(winPct(A[i + 1].lines[0]));
    const wpSecond = A[i].lines[1] ? pov(winPct(A[i].lines[1])) : null;
    const loss = Math.max(0, wpBest - wpAfter);
    const isBest = A[i].best === uci || loss < 1;
    const prev = plies[i - 1];
    let cls: Cls;
    if (bookPrefixes.has(sans.slice(0, i + 1).join(" "))) cls = "book";
    else if (loss >= 20) cls = "blunder";
    else if (prev && (prev.cls === "blunder" || prev.cls === "mistake") && loss >= 8) cls = "miss";
    else if (loss >= 10) cls = "mistake";
    else if (loss >= 5) cls = "inaccuracy";
    else if (isBest) {
      // brilliant: a sound sacrifice (material down after the opponent's best reply, position still fine)
      let sac = false;
      const reply = A[i + 1].best;
      if (reply) {
        try {
          const h = new Chess(fens[i + 1]);
          h.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] });
          sac = material(h.fen(), color) - material(fens[i], color) <= -2;
        } catch {}
      }
      if (sac && wpAfter >= 50 && wpBest < 97 && !san.includes("=")) cls = "brilliant";
      // great: the only good move (the second-best line is much worse) in a position that wasn't already won
      else if (wpSecond != null && wpBest - wpSecond >= 20 && wpBest > 25 && wpBest < 92) cls = "great";
      else cls = "best";
    } else if (loss < 2.5) cls = "excellent";
    else cls = "good";
    const accMove = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
    acc[color].push(accMove);
    counts[color][cls] = (counts[color][cls] ?? 0) + 1;
    plies.push({ san, uci, color, cls, loss: Math.round(loss * 10) / 10, after: A[i + 1].lines[0], bestSan: A[i].best ? uciLineToSan(fens[i], [A[i].best!], 1)[0] ?? null : null, bestLine: uciLineToSan(fens[i], A[i].lines[0]?.pv ?? []), fenBefore: fens[i] });
  }
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
  return { plies, accuracy: { w: mean(acc.w), b: mean(acc.b) }, counts };
}

/** Positions from your own mistakes, as single-move puzzles (only where the best move clearly stands out). */
export function puzzlesFromReview(r: Review, me: "w" | "b") {
  return r.plies
    .filter((p) => p.color === me && (p.cls === "mistake" || p.cls === "blunder" || p.cls === "miss") && p.bestSan)
    .map((p) => ({ fen: p.fenBefore, solution: p.bestLine.slice(0, 1), played: p.san, cls: p.cls }));
}
