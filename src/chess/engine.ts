"use client";
// Stockfish 18 (lite, single-threaded WASM) in a Web Worker. Runs on your device, no server.
// Scores are converted to White's point of view.

export type Line = { cp: number | null; mate: number | null; pv: string[]; depth: number };
export type Analysis = { best: string | null; lines: Line[] };

export class Engine {
  private w: Worker;
  private chain: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(l: string) => void>();
  constructor() {
    this.w = new Worker("/engine/stockfish-18-lite-single.js");
    this.w.onmessage = (e) => this.listeners.forEach((f) => f(String(e.data)));
    this.w.postMessage("uci");
    this.w.postMessage("setoption name Hash value 32");
    this.w.postMessage("isready");
  }
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => {});
    return p;
  }
  private until(pred: (l: string) => boolean, onLine?: (l: string) => void) {
    return new Promise<string>((resolve) => {
      const f = (l: string) => { onLine?.(l); if (pred(l)) { this.listeners.delete(f); resolve(l); } };
      this.listeners.add(f);
    });
  }
  /** Analyse a position. multipv > 1 also returns the runner-up lines. */
  analyse(fen: string, o: { depth?: number; multipv?: number; movetime?: number; onUpdate?: (a: Analysis) => void } = {}): Promise<Analysis> {
    return this.run(async () => {
      const black = fen.split(" ")[1] === "b";
      const lines: Line[] = [];
      this.w.postMessage(`setoption name MultiPV value ${o.multipv ?? 1}`);
      this.w.postMessage("ucinewgame");
      this.w.postMessage(`position fen ${fen}`);
      this.w.postMessage(o.movetime ? `go movetime ${o.movetime}` : `go depth ${o.depth ?? 14}`);
      const done = await this.until((l) => l.startsWith("bestmove"), (l) => {
        if (!l.startsWith("info") || !l.includes(" pv ")) return;
        const k = Number(/ multipv (\d+)/.exec(l)?.[1] ?? 1) - 1;
        const depth = Number(/ depth (\d+)/.exec(l)?.[1] ?? 0);
        const cp = / score cp (-?\d+)/.exec(l)?.[1], mate = / score mate (-?\d+)/.exec(l)?.[1];
        const sign = black ? -1 : 1;
        lines[k] = { depth, cp: cp != null ? Number(cp) * sign : null, mate: mate != null ? Number(mate) * sign : null, pv: l.split(" pv ")[1].trim().split(" ") };
        o.onUpdate?.({ best: lines[0]?.pv[0] ?? null, lines: [...lines] });
      });
      const best = done.split(" ")[1];
      return { best: best && best !== "(none)" ? best : null, lines: lines.filter(Boolean) };
    });
  }
  /** Engine move for playing against it (skill 0-20). */
  async play(fen: string, skill: number, movetime = 600) {
    this.w.postMessage(`setoption name Skill Level value ${skill}`);
    const a = await this.analyse(fen, { movetime });
    this.w.postMessage("setoption name Skill Level value 20");
    return a.best;
  }
  /**
   * A human-like move at a target Elo. 1320+ uses Stockfish's own strength limiter (UCI_Elo);
   * below that, picks among the top lines with a temperature that grows as the rating drops,
   * plus an occasional outright blunder at very low ratings.
   */
  async humanMove(fen: string, elo: number): Promise<{ move: string | null; thinkMs: number }> {
    if (elo >= 1320) {
      this.w.postMessage("setoption name UCI_LimitStrength value true");
      this.w.postMessage(`setoption name UCI_Elo value ${Math.min(3190, elo)}`);
      const a = await this.analyse(fen, { movetime: 400 + Math.min(1600, elo / 2), multipv: 1 });
      this.w.postMessage("setoption name UCI_LimitStrength value false");
      const close = a.lines.length > 1 && Math.abs((a.lines[0].cp ?? 0) - (a.lines[1].cp ?? 0)) < 40;
      return { move: a.best, thinkMs: humanDelay(close) };
    }
    const a = await this.analyse(fen, { depth: 8, multipv: 5 });
    const black = fen.split(" ")[1] === "b";
    const score = (l: Line) => (l.mate != null ? (l.mate > 0 ? 10000 : -10000) : (l.cp ?? 0)) * (black ? -1 : 1);
    const lines = a.lines.filter((l) => l.pv[0]);
    if (!lines.length) return { move: a.best, thinkMs: humanDelay(false) };
    const top = score(lines[0]);
    // temperature in centipawns: ~45 at 1300 up to ~260 at 400
    const T = 45 + ((1320 - Math.max(400, elo)) / 920) * 215;
    const blunderChance = elo < 700 ? 0.08 : elo < 1000 ? 0.04 : 0.015;
    let pick = lines[0];
    if (Math.random() < blunderChance && lines.length > 2) pick = lines[lines.length - 1];
    else {
      const w = lines.map((l) => Math.exp(-(top - score(l)) / T));
      let r = Math.random() * w.reduce((x, y) => x + y, 0);
      for (let i = 0; i < lines.length; i++) { r -= w[i]; if (r <= 0) { pick = lines[i]; break; } }
    }
    const close = lines.length > 1 && Math.abs(score(lines[0]) - score(lines[1])) < 40;
    return { move: pick.pv[0], thinkMs: humanDelay(close) };
  }
  stop() { this.w.postMessage("stop"); }
  quit() { this.w.terminate(); this.listeners.clear(); }
}

/** Think time like a person: quick in simple positions, longer when moves are close. */
function humanDelay(hard: boolean) {
  const base = 500 + Math.random() * 1400;
  return Math.round(hard ? base + 800 + Math.random() * 2200 : base);
}

/** Win probability (0-100) for White from a line (lichess formula). */
export function winPct(l: { cp: number | null; mate: number | null } | undefined) {
  if (!l) return 50;
  if (l.mate != null) return l.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, l.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export const fmtEval = (l?: Line) => {
  if (!l) return "…";
  if (l.mate != null) return `M${Math.abs(Math.ceil(l.mate))}${l.mate < 0 ? " (Black)" : ""}`;
  const v = Math.round((l.cp ?? 0) / 10) / 10;
  return v === 0 ? "0.0" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
};
