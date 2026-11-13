// Game review: classify every move like chess.com (brilliant, great, best, excellent, good,
// book, inaccuracy, mistake, miss, blunder) from Stockfish evaluations, computed in code,
// plus a coach line per move, per-phase accuracy and an estimated game rating.
import { Chess } from "chess.js";
import { OPENINGS } from "./openings";
import { winPct, fmtEval, type Analysis, type Line } from "./engine";

export type Cls = "brilliant" | "great" | "best" | "excellent" | "good" | "book" | "inaccuracy" | "mistake" | "miss" | "blunder";
export const CLS: Record<Cls, { label: string; sym: string; color: string }> = {
  brilliant: { label: "Brilliant", sym: "!!", color: "#26c2a3" },
  great: { label: "Great", sym: "!", color: "#749bbf" },
  best: { label: "Best", sym: "★", color: "#81b64c" },
  excellent: { label: "Excellent", sym: "👍", color: "#81b64c" },
  good: { label: "Good", sym: "✓", color: "#95b776" },
  book: { label: "Book", sym: "📖", color: "#d5a47d" },
  inaccuracy: { label: "Inaccuracy", sym: "?!", color: "#f7c631" },
  mistake: { label: "Mistake", sym: "?", color: "#ffa459" },
  miss: { label: "Miss", sym: "✕", color: "#ff7769" },
  blunder: { label: "Blunder", sym: "??", color: "#fa412d" },
};
export const CLS_ORDER: Cls[] = ["brilliant", "great", "best", "excellent", "good", "book", "inaccuracy", "mistake", "miss", "blunder"];
export const KEY_CLS: Cls[] = ["brilliant", "great", "mistake", "miss", "blunder"];
export const BAD_CLS: Cls[] = ["inaccuracy", "mistake", "miss", "blunder"];

export type Phase = "opening" | "middlegame" | "endgame";
export type Ply = {
  san: string; uci: string; color: "w" | "b"; cls: Cls; loss: number;
  before: Line | undefined; after: Line | undefined;
  best: string | null; bestSan: string | null; bestLine: string[];
  /** Moves that would have been about as good (for "Retry"). */
  alts: string[];
  /** The opponent's best reply line after this move (for "Show follow-up"). */
  replyLine: string[];
  fenBefore: string; fenAfter: string; phase: Phase; coach: string;
};
export type Review = {
  plies: Ply[]; startFen: string;
  accuracy: { w: number; b: number };
  counts: Record<"w" | "b", Partial<Record<Cls, number>>>;
  phases: Record<"w" | "b", Partial<Record<Phase, number>>>;
  rating: { w: number; b: number };
  opening: string | null;
};

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
function material(fen: string, color: "w" | "b") {
  let s = 0;
  for (const row of new Chess(fen).board()) for (const p of row) if (p) s += (p.color === color ? 1 : -1) * VAL[p.type];
  return s;
}
function pieceTotal(fen: string) {
  let s = 0;
  for (const row of new Chess(fen).board()) for (const p of row) if (p && p.type !== "p") s += VAL[p.type];
  return s;
}
const toUci = (m: { from: string; to: string; promotion?: string }) => m.from + m.to + (m.promotion ?? "");
export function uciLineToSan(fen: string, pv: string[], max = 6) {
  const g = new Chess(fen), out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try { out.push(g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch { break; }
  }
  return out;
}
/** Material change for `color` along a line (positive = gains). */
function swing(fen: string, pv: string[], color: "w" | "b", plies = 4) {
  const g = new Chess(fen);
  const m0 = material(fen, color);
  for (const u of pv.slice(0, plies)) { try { g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); } catch { break; } }
  return material(g.fen(), color) - m0;
}
const bookPrefixes = new Map<string, string>();
for (const o of OPENINGS) { const m = o.moves.split(" "); m.forEach((_, i) => { const k = m.slice(0, i + 1).join(" "); if (!bookPrefixes.has(k)) bookPrefixes.set(k, o.name); }); }

/** Final-position "analysis" when the game is over (no engine needed). */
function terminal(fen: string): Line | null {
  const g = new Chess(fen);
  if (g.isCheckmate()) return { cp: null, mate: g.turn() === "w" ? -0.5 : 0.5, pv: [], depth: 0 };
  if (g.isDraw() || g.isStalemate()) return { cp: 0, mate: null, pv: [], depth: 0 };
  return null;
}

/** Rough performance rating from accuracy (an estimate, not chess.com's formula). */
export function estRating(acc: number) {
  const pts: [number, number][] = [[0, 100], [40, 250], [50, 450], [60, 750], [70, 1100], [75, 1300], [80, 1550], [85, 1800], [90, 2100], [94, 2450], [97, 2750], [100, 3000]];
  for (let i = 1; i < pts.length; i++) {
    if (acc <= pts[i][0]) { const [a0, r0] = pts[i - 1], [a1, r1] = pts[i]; return Math.round((r0 + ((acc - a0) / (a1 - a0)) * (r1 - r0)) / 50) * 50; }
  }
  return 3000;
}

export async function reviewGame(sans: string[], analyse: (fen: string) => Promise<Analysis>, onProgress?: (done: number, total: number) => void, startFen?: string): Promise<Review> {
  const g = new Chess(startFen);
  const start = g.fen();
  const fens = [g.fen()], moves: { san: string; uci: string; color: "w" | "b"; captured?: string; piece: string; to: string }[] = [];
  for (const s of sans) {
    const color = g.turn();
    const m = g.move(s);
    moves.push({ san: m.san, uci: toUci(m), color, captured: m.captured, piece: m.piece, to: m.to });
    fens.push(g.fen());
  }
  const A: Analysis[] = [];
  for (let i = 0; i < fens.length; i++) {
    const t = terminal(fens[i]);
    A.push(t ? { best: null, lines: [t] } : await analyse(fens[i]));
    onProgress?.(i + 1, fens.length);
  }
  const fromStart = !startFen || start === new Chess().fen();
  const plies: Ply[] = [];
  const acc: Record<"w" | "b", number[]> = { w: [], b: [] };
  const phaseAcc: Record<"w" | "b", Record<Phase, number[]>> = { w: { opening: [], middlegame: [], endgame: [] }, b: { opening: [], middlegame: [], endgame: [] } };
  const counts: Review["counts"] = { w: {}, b: {} };
  let opening: string | null = null;
  let leftBook = false;
  for (let i = 0; i < moves.length; i++) {
    const { san, uci, color, captured, piece, to } = moves[i];
    const pov = (wp: number) => (color === "w" ? wp : 100 - wp);
    const wpBest = pov(winPct(A[i].lines[0]));
    const wpAfter = pov(winPct(A[i + 1].lines[0]));
    const wpSecond = A[i].lines[1] ? pov(winPct(A[i].lines[1])) : null;
    const loss = Math.max(0, wpBest - wpAfter);
    const isBest = A[i].best === uci || loss < 1;
    const prev = plies[i - 1];
    const bookName = fromStart && !leftBook ? bookPrefixes.get(sans.slice(0, i + 1).join(" ")) : undefined;
    if (bookName) opening = bookName; else leftBook = true;
    let cls: Cls;
    if (bookName) cls = "book";
    else if (prev && BAD_CLS.includes(prev.cls) && prev.cls !== "inaccuracy" && loss >= 8 && wpBest > 60) cls = "miss";
    else if (loss >= 20) cls = "blunder";
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
    const total = pieceTotal(fens[i]);
    const phase: Phase = total <= 26 ? "endgame" : i < 20 && (bookName || i < 16) ? "opening" : "middlegame";
    const accMove = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
    acc[color].push(accMove);
    phaseAcc[color][phase].push(accMove);
    counts[color][cls] = (counts[color][cls] ?? 0) + 1;
    const best = A[i].best;
    const bestSan = best ? uciLineToSan(fens[i], [best], 1)[0] ?? null : null;
    const alts = A[i].lines.filter((l) => l.pv[0] && wpBest - pov(winPct(l)) < 3).map((l) => l.pv[0]);
    const replyPv = A[i + 1].lines[0]?.pv ?? [];
    const ply: Ply = {
      san, uci, color, cls, loss: Math.round(loss * 10) / 10, before: A[i].lines[0], after: A[i + 1].lines[0],
      best, bestSan, bestLine: uciLineToSan(fens[i], A[i].lines[0]?.pv ?? []), alts,
      replyLine: uciLineToSan(fens[i + 1], replyPv), fenBefore: fens[i], fenAfter: fens[i + 1], phase, coach: "",
    };
    ply.coach = coach(ply, { captured, piece, to, bookName, prev, replyPv, bestPv: A[i].lines[0]?.pv ?? [], wpBest, wpAfter });
    plies.push(ply);
  }
  const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
  const accuracy = { w: mean(acc.w), b: mean(acc.b) };
  const phases: Review["phases"] = { w: {}, b: {} };
  for (const c of ["w", "b"] as const) for (const ph of ["opening", "middlegame", "endgame"] as Phase[]) if (phaseAcc[c][ph].length) phases[c][ph] = mean(phaseAcc[c][ph]);
  return { plies, startFen: start, accuracy, counts, phases, rating: { w: estRating(accuracy.w), b: estRating(accuracy.b) }, opening };
}

/** A short coach comment for a move, built from the engine's numbers (no AI needed). */
function coach(p: Ply, x: { captured?: string; piece: string; to: string; bookName?: string; prev?: Ply; replyPv: string[]; bestPv: string[]; wpBest: number; wpAfter: number }) {
  const better = p.bestSan && p.bestSan !== p.san ? ` ${p.bestSan} was better${p.bestLine.length > 1 ? ` (${p.bestLine.slice(0, 4).join(" ")})` : ""}.` : "";
  const mateAgainst = p.after?.mate != null && (p.color === "w" ? p.after.mate < 0 : p.after.mate > 0);
  const mateFor = p.after?.mate != null && !mateAgainst;
  const replySan = p.replyLine[0];
  const lost = -swing(p.fenAfter, x.replyPv, p.color, 4);
  const bestGain = swing(p.fenBefore, x.bestPv, p.color, 5);
  const bestMate = p.before?.mate != null && (p.color === "w" ? p.before.mate > 0 : p.before.mate < 0);
  const taken = (() => {
    const r = x.replyPv[0];
    if (!r) return null;
    try { const g = new Chess(p.fenAfter); const m = g.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] }); return m.captured ? { what: NAME[m.captured], on: m.to, same: m.to === x.to } : null; } catch { return null; }
  })();
  const evalTxt = `${fmtEval(p.before)} → ${fmtEval(p.after)}`;
  switch (p.cls) {
    case "book": return `${p.san} is book${x.bookName ? `: ${x.bookName}` : ""}.`;
    case "brilliant": return `${p.san}!! A brilliant sacrifice: it gives up material, but the follow-up${p.replyLine.length ? ` (${p.replyLine.slice(0, 3).join(" ")}…)` : ""} keeps you ${x.wpAfter > 65 ? "winning" : "fine"}.`;
    case "great": return `${p.san}! The only good move here: everything else was much worse.`;
    case "best": return p.san.includes("#") ? "Checkmate. The best move." : `${p.san} is the best move${x.captured ? `, taking the ${NAME[x.captured]}` : ""}.`;
    case "excellent": return `${p.san} is excellent, almost as good as the engine's top choice${p.bestSan && p.bestSan !== p.san ? ` (${p.bestSan})` : ""}.`;
    case "good": return `${p.san} is fine, but a bit passive.${better}`;
    case "inaccuracy": return `${p.san} is an inaccuracy (${evalTxt}).${better}`;
    case "miss":
      return `${p.san} misses the chance to punish your opponent's mistake.${bestMate ? ` ${p.bestSan} led to mate.` : bestGain >= 2 ? ` ${p.bestSan} wins material (about ${bestGain} points).` : better}`;
    case "mistake":
    case "blunder": {
      const label = p.cls === "blunder" ? "a blunder" : "a mistake";
      if (mateAgainst) return `${p.san} is ${label}: it allows mate in ${Math.abs(Math.ceil(p.after!.mate!))}${replySan ? ` starting with ${replySan}` : ""}.${better}`;
      if (taken?.same) return `${p.san} is ${label}: your ${NAME[x.piece]} on ${x.to} can be taken by ${replySan}.${better}`;
      if (lost >= 2 && taken) return `${p.san} is ${label}: after ${replySan} you lose your ${taken.what}.${better}`;
      if (lost >= 2) return `${p.san} is ${label}: it loses material after ${p.replyLine.slice(0, 3).join(" ")}.${better}`;
      if (bestMate) return `${p.san} is ${label}: you had a forced mate with ${p.bestSan}.`;
      if (mateFor) return `${p.san} still wins, but much more slowly.${better}`;
      return `${p.san} is ${label} (${evalTxt}): it lets your opponent's ${replySan ? `${replySan} ` : ""}take over.${better}`;
    }
  }
}

/** Classify one move from its win-chance loss (same thresholds as the full review). */
export function classifyLoss(loss: number, isBest: boolean): Cls {
  if (loss >= 20) return "blunder";
  if (loss >= 10) return "mistake";
  if (loss >= 5) return "inaccuracy";
  if (isBest || loss < 1) return "best";
  if (loss < 2.5) return "excellent";
  return "good";
}
/** What accuracy is "good" depends on the time control. */
export const TC_EXPECT: Record<string, number> = { bullet: 70, blitz: 78, rapid: 85, daily: 90, untimed: 88, practice: 85 };

/** Positions from your own mistakes, as single-move puzzles (only where the best move clearly stands out). */
export function puzzlesFromReview(r: Review, me: "w" | "b") {
  return r.plies
    .filter((p) => p.color === me && (p.cls === "mistake" || p.cls === "blunder" || p.cls === "miss") && p.bestSan)
    .map((p) => ({ fen: p.fenBefore, solution: p.bestLine.slice(0, 1), played: p.san, cls: p.cls }));
}
