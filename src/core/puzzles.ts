// Chess puzzles that work where lichess.org is blocked (school networks): the site's server fetches them from
// lichess for you, and every puzzle it gets is kept, so a stash builds up that also works offline / blocked.
import { Chess } from "chess.js";
import type { Store } from "./store";

const uci = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] ?? "q" });
function sansOf(pgn: string) {
  const out = new Chess();
  for (const t of pgn.replace(/\{[^}]*\}|\d+\.(\.\.)?/g, " ").split(/\s+/).filter((x) => x && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(x))) { try { out.move(t); } catch { break; } }
  return out.history();
}
export type Puzzle = { id: string; fen: string; solution: string[]; rating?: number; themes?: string[]; source: "lichess" };
/** A lichess puzzle API answer -> the position to solve from (same logic the board used client-side). */
export function fromLichess(j: { game: { pgn: string }; puzzle: { id: string; solution: string[]; rating: number; themes: string[]; initialPly?: number } }): Puzzle | null {
  const sans = sansOf(j.game.pgn);
  for (const n of [sans.length, (j.puzzle.initialPly ?? sans.length - 1) + 1]) {
    const g = new Chess();
    for (const m of sans.slice(0, n)) g.move(m);
    try { new Chess(g.fen()).move(uci(j.puzzle.solution[0])); return { id: j.puzzle.id, fen: g.fen(), solution: j.puzzle.solution, rating: j.puzzle.rating, themes: j.puzzle.themes, source: "lichess" }; } catch { /* try the other start */ }
  }
  return null;
}
async function fromNet(theme: string, difficulty: string) {
  const r = await fetch(`https://lichess.org/api/puzzle/next?angle=${encodeURIComponent(theme)}&difficulty=${encodeURIComponent(difficulty)}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!r.ok) throw new Error(`lichess ${r.status}`);
  return fromLichess(await r.json());
}
const DIFF: Record<string, [number, number]> = { easiest: [400, 1200], easier: [800, 1500], normal: [1200, 1900], harder: [1600, 2300], hardest: [2000, 3200] };
/** Fetch one (and keep it); if lichess can't be reached, serve one from the stash, least-served first. */
export async function nextPuzzle(store: Store, theme = "mix", difficulty = "normal") {
  try {
    const p = await fromNet(theme, difficulty);
    if (p) { await store.insert("puzzle_cache", { id: p.id, fen: p.fen, solution: p.solution, rating: p.rating ?? null, themes: p.themes ?? [], difficulty, served: 1 }).catch(() => null); return { ...p, via: "lichess" }; }
  } catch { /* fall back to the stash */ }
  const [lo, hi] = DIFF[difficulty] ?? [0, 4000];
  const rows = (await store.list("puzzle_cache", { limit: 5000 })).filter((r) => (theme === "mix" || (r.themes ?? []).includes(theme)));
  const inBand = rows.filter((r) => r.rating == null || (r.rating >= lo && r.rating <= hi));
  const pool = (inBand.length ? inBand : rows).sort((a, b) => Number(a.served) - Number(b.served)).slice(0, 25);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (!pick) return null;
  await store.update("puzzle_cache", pick.id, { served: Number(pick.served ?? 0) + 1 }).catch(() => null);
  return { id: pick.id, fen: pick.fen, solution: pick.solution, rating: pick.rating ?? undefined, themes: pick.themes ?? [], source: "lichess" as const, via: "stash" };
}
/** Top the stash up (run by the relay and the daily job): a few per theme so every theme works blocked. */
export async function topUpPuzzles(store: Store, perTheme = 4) {
  const themes = ["mix", "mateIn1", "mateIn2", "fork", "pin", "skewer", "discoveredAttack", "sacrifice", "endgame", "hangingPiece", "promotion", "deflection"];
  const have = await store.list("puzzle_cache", { limit: 5000 });
  let n = 0;
  for (const t of themes) {
    const count = have.filter((r) => t === "mix" || (r.themes ?? []).includes(t)).length;
    for (let i = count; i < 40 && i < count + perTheme; i++) {
      try { const p = await fromNet(t, ["easier", "normal", "harder"][i % 3]); if (p) { await store.insert("puzzle_cache", { id: p.id, fen: p.fen, solution: p.solution, rating: p.rating ?? null, themes: p.themes ?? [], difficulty: "normal", served: 0 }).catch(() => null); n++; } } catch { return n; }
      await new Promise((r) => setTimeout(r, 700)); // be polite to lichess
    }
  }
  return n;
}
