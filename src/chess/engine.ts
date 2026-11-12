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
  stop() { this.w.postMessage("stop"); }
  quit() { this.w.terminate(); this.listeners.clear(); }
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
