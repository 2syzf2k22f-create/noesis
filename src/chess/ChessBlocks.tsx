"use client";
// Chess: analysis board (and play vs Stockfish), opening trainer, puzzles, game review.

import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import type { BlockCtx } from "@/ui/Blocks";
import { Board, EvalBar, type Mark } from "./Board";
import { Engine, fmtEval, winPct, type Analysis } from "./engine";
import { OPENINGS, type Opening } from "./openings";
import { CLS, CLS_ORDER, puzzlesFromReview, reviewGame, type Review } from "./review";
import c from "./chess.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };

/** One shared engine per page. */
let shared: Engine | null = null;
function useEngine() {
  const [e, setE] = useState<Engine | null>(null);
  useEffect(() => { queueMicrotask(() => { shared ??= new Engine(); setE(shared); }); }, []);
  return e;
}
const uciMove = (u: string) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] ?? "q" });
const sansOf = (pgnOrMoves: string) => {
  const g = new Chess();
  try { g.loadPgn(pgnOrMoves); return g.history(); } catch {}
  const out = new Chess();
  for (const t of pgnOrMoves.replace(/\{[^}]*\}|\d+\.(\.\.)?/g, " ").split(/\s+/).filter((x) => x && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(x))) {
    try { out.move(t); } catch { break; }
  }
  return out.history();
};

/* ======================= analysis board / play vs engine ======================= */
const ELOS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2700, 3000];
const CLOCKS: { label: string; base: number; inc: number }[] = [
  { label: "No clock", base: 0, inc: 0 }, { label: "3 + 2", base: 180, inc: 2 }, { label: "5 + 0", base: 300, inc: 0 },
  { label: "10 + 0", base: 600, inc: 0 }, { label: "15 + 10", base: 900, inc: 10 }, { label: "30 + 0", base: 1800, inc: 0 },
];
type Play = { elo: number; me: "w" | "b"; clock: { base: number; inc: number }; startFen: string; over: string | null };
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

export function AnalysisBoard({ ctx, p }: { ctx?: BlockCtx; p?: P }) {
  const engine = useEngine();
  const [start, setStart] = useState(new Chess().fen());
  const [moves, setMoves] = useState<string[]>([]);
  const [idx, setIdx] = useState(0);
  const [flip, setFlip] = useState(false);
  const [an, setAn] = useState<Analysis | null>(null);
  const [load, setLoad] = useState("");
  const [play, setPlay] = useState<Play | null>(null);
  const [setup, setSetup] = useState({ elo: 1200, color: "w" as "w" | "b" | "random", clock: 0 });
  const [clocks, setClocks] = useState<{ w: number; b: number }>({ w: 0, b: 0 });
  const [thinking, setThinking] = useState(false);
  const saved = useRef(false);
  const pos = useMemo(() => {
    const g = new Chess(start);
    for (const m of moves.slice(0, idx)) g.move(m);
    return g;
  }, [start, moves, idx]);
  const fen = pos.fen();
  const last = useMemo(() => { const h = pos.history({ verbose: true }); return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null; }, [pos]);
  const playing = !!play && !play.over;

  // live analysis (only when not playing, so it can't help you)
  useEffect(() => {
    if (!engine || pos.isGameOver() || play) return;
    let live = true;
    engine.analyse(fen, { depth: 16, multipv: 3, onUpdate: (a) => { if (live) setAn(a); } }).then((a) => { if (live) setAn(a); });
    return () => { live = false; engine.stop(); };
  }, [engine, fen, pos, play]);

  const push = useCallback((san: string) => { setMoves((ms) => [...ms.slice(0, idx), san]); setIdx((i) => i + 1); }, [idx]);

  const finish = useCallback((result: string, how: string) => {
    setPlay((pl) => (pl ? { ...pl, over: `${how}` } : pl));
    if (saved.current || !play) return;
    saved.current = true;
    const score = result === "draw" ? 0.5 : result === "win" ? 1 : 0;
    void ctx?.write("create", "chess_practice", { elo: play.elo, color: play.me === "w" ? "white" : "black", result, score, how, moves: moves.slice(0, idx).join(" "), start_fen: play.startFen, plies: idx });
  }, [ctx, play, moves, idx]);

  // game end detection
  useEffect(() => {
    if (!playing || !play) return;
    if (pos.isCheckmate()) queueMicrotask(() => finish(pos.turn() === play.me ? "loss" : "win", pos.turn() === play.me ? "Checkmated" : "You won by checkmate"));
    else if (pos.isDraw()) queueMicrotask(() => finish("draw", pos.isStalemate() ? "Draw by stalemate" : pos.isThreefoldRepetition() ? "Draw by repetition" : "Draw"));
  }, [pos, playing, play, finish]);

  // engine replies
  useEffect(() => {
    if (!playing || !play || !engine || pos.isGameOver() || pos.turn() === play.me) return;
    let live = true;
    queueMicrotask(() => setThinking(true));
    const t0 = Date.now();
    engine.humanMove(fen, play.elo).then(({ move, thinkMs }) => {
      const wait = Math.max(0, thinkMs - (Date.now() - t0));
      setTimeout(() => {
        if (!live || !move) return;
        setThinking(false);
        if (play.clock.base) setClocks((c) => { const side = play.me === "w" ? "b" : "w"; return { ...c, [side]: c[side] - (Date.now() - t0) / 1000 + play.clock.inc }; });
        const g = new Chess(fen);
        try { push(g.move(uciMove(move)).san); } catch {}
      }, wait);
    });
    return () => { live = false; };
  }, [playing, play, engine, fen, pos, push]);

  // your clock ticks on your turn
  useEffect(() => {
    if (!playing || !play?.clock.base || pos.turn() !== play.me) return;
    const id = setInterval(() => setClocks((c) => {
      const v = c[play.me] - 0.2;
      if (v <= 0) { queueMicrotask(() => finish("loss", "Lost on time")); return { ...c, [play.me]: 0 }; }
      return { ...c, [play.me]: v };
    }), 200);
    return () => clearInterval(id);
  }, [playing, play, pos, finish]);

  const onMove = (from: string, to: string) => {
    if (playing && pos.turn() !== play!.me) return;
    if (playing && idx !== moves.length) return; // can't move while browsing back in a game
    const g = new Chess(fen);
    try {
      push(g.move({ from, to, promotion: "q" }).san);
      if (playing && play!.clock.inc) setClocks((c) => ({ ...c, [play!.me]: c[play!.me] + play!.clock.inc }));
    } catch {}
  };
  const startGame = (fromHere: boolean) => {
    const me = setup.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : setup.color;
    const sf = fromHere ? fen : new Chess().fen();
    const clock = CLOCKS[setup.clock];
    saved.current = false;
    setStart(sf); setMoves([]); setIdx(0); setFlip(me === "b");
    setClocks({ w: clock.base, b: clock.base });
    setPlay({ elo: setup.elo, me, clock: { base: clock.base, inc: clock.inc }, startFen: sf, over: null });
  };
  const top = an?.lines[0];
  const pct = play ? 50 : winPct(top);
  return (
    <div className={c.wrap}>
      <div className={c.boardCol}>
        {!play && <EvalBar pct={pct} label={fmtEval(top)} />}
        <div style={{ flex: 1, display: "grid", gap: 6 }}>
          {play && play.clock.base > 0 && <div className={c.clock} data-active={playing && pos.turn() !== play.me}>Stockfish {play.elo} · {mmss(clocks[play.me === "w" ? "b" : "w"])}</div>}
          <Board fen={fen} orientation={flip ? "black" : "white"} onMove={onMove} lastMove={last}
            hint={!play && an?.best ? { from: an.best.slice(0, 2), to: an.best.slice(2, 4) } : null} />
          {play && play.clock.base > 0 && <div className={c.clock} data-active={playing && pos.turn() === play.me}>You · {mmss(clocks[play.me])}</div>}
        </div>
      </div>
      <div className={c.side}>
        {play ? (
          <>
            <div className={c.msg} data-tone={play.over ? (play.over.includes("won") ? "good" : play.over.startsWith("Draw") ? undefined : "bad") : undefined}>
              {play.over ?? (thinking ? `Stockfish (${play.elo}) is thinking…` : `Your move (${play.me === "w" ? "White" : "Black"}) vs Stockfish ${play.elo}`)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {playing && <button className="pill" onClick={() => finish("loss", "You resigned")}>Resign</button>}
              {playing && <button className="pill" onClick={() => finish("draw", "Draw agreed")}>Offer draw</button>}
              {play.over && <button className="pill" data-active="true" onClick={() => startGame(false)}>Rematch</button>}
              {play.over && <button className="pill" onClick={() => { setPlay(null); }}>Analyse this game</button>}
            </div>
          </>
        ) : (
          <>
            <div className="label">{pos.isCheckmate() ? "Checkmate" : pos.isDraw() ? "Draw" : `${pos.turn() === "w" ? "White" : "Black"} to move`} · eval {fmtEval(top)}{top ? ` · depth ${top.depth}` : ""}</div>
            {an?.lines.map((l, i) => (
              <div key={i} className={c.msg}><b>{fmtEval(l)}</b> {(() => { const g = new Chess(fen); return l.pv.slice(0, 8).map((u) => { try { return g.move(uciMove(u)).san; } catch { return ""; } }).join(" "); })()}</div>
            ))}
          </>
        )}
        <div className={c.moves}>
          {moves.map((m, i) => {
            const [, side, , , , full] = start.split(" ");
            const ply = (Number(full) - 1) * 2 + (side === "b" ? 1 : 0) + i;
            const label = ply % 2 === 0 ? `${ply / 2 + 1}.` : i === 0 ? `${(ply - 1) / 2 + 1}...` : "";
            return <button key={i} data-on={i + 1 === idx} onClick={() => setIdx(i + 1)}>{label && <em>{label}</em>}{m}</button>;
          })}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="pill" onClick={() => setIdx(0)}>⏮</button>
          <button className="pill" onClick={() => setIdx((i) => Math.max(0, i - 1))}>◀</button>
          <button className="pill" onClick={() => setIdx((i) => Math.min(moves.length, i + 1))}>▶</button>
          <button className="pill" onClick={() => setFlip((f) => !f)}>Flip</button>
          {!playing && <button className="pill" onClick={() => { setPlay(null); setMoves([]); setIdx(0); setStart(new Chess().fen()); }}>New board</button>}
        </div>
        {!playing && (
          <div className={c.playBox}>
            <div className="label">Play Stockfish</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select className={c.sel} value={setup.elo} onChange={(e) => setSetup({ ...setup, elo: Number(e.target.value) })}>{ELOS.map((e) => <option key={e} value={e}>{e} Elo</option>)}</select>
              <select className={c.sel} value={setup.color} onChange={(e) => setSetup({ ...setup, color: e.target.value as "w" | "b" | "random" })}><option value="w">I play White</option><option value="b">I play Black</option><option value="random">Random colour</option></select>
              <select className={c.sel} value={setup.clock} onChange={(e) => setSetup({ ...setup, clock: Number(e.target.value) })}>{CLOCKS.map((k, i) => <option key={k.label} value={i}>{k.label}</option>)}</select>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="pill" data-active="true" onClick={() => startGame(false)}>New game</button>
              <button className="pill" onClick={() => startGame(true)} title="Start a game from the position on the board">Play from this position</button>
            </div>
          </div>
        )}
        {!play && (
          <>
            <textarea className={c.input} rows={2} placeholder="Paste a PGN or FEN to load it (then analyse, or play from it)" value={load} onChange={(e) => setLoad(e.target.value)} />
            <button className="pill" onClick={() => {
              const t = load.trim();
              if (/^([rnbqkpRNBQKP1-8]+\/){7}/.test(t)) { try { new Chess(t); setStart(t); setMoves([]); setIdx(0); } catch {} }
              else { const ms = sansOf(t); setStart(new Chess().fen()); setMoves(ms); setIdx(ms.length); }
              setLoad("");
            }}>Load</button>
          </>
        )}
        {p?.note && <small className="label">{String(p.note)}</small>}
      </div>
    </div>
  );
}

/* ======================= opening trainer ======================= */
export function OpeningTrainer({ ctx }: { ctx: BlockCtx }) {
  const { submit } = useApollo();
  const drills = (ctx.data?.rows ?? []) as Row[];
  const [op, setOp] = useState<Opening>(OPENINGS[0]);
  const line = useMemo(() => op.moves.split(" "), [op]);
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState<{ t: string; tone?: string } | null>(null);
  const [hint, setHint] = useState(false);
  const [running, setRunning] = useState(false);
  const mySide = op.side === "white" ? "w" : "b";
  const pos = useMemo(() => { const g = new Chess(); for (const m of line.slice(0, ply)) g.move(m); return g; }, [line, ply]);
  const done = ply >= line.length;
  const stats = (id: string) => {
    const ds = drills.filter((d) => d.opening === id);
    return ds.length ? `${ds.filter((d) => d.mistakes === 0).length}/${ds.length} clean` : "new";
  };
  // auto-play the other side's book move
  useEffect(() => {
    if (!running || done || pos.turn() === mySide) return;
    const t = setTimeout(() => setPly((p) => p + 1), 380);
    return () => clearTimeout(t);
  }, [running, done, pos, mySide]);
  useEffect(() => {
    if (running && done) {
      queueMicrotask(() => setMsg({ t: mistakes ? `Line complete with ${mistakes} slip${mistakes > 1 ? "s" : ""}. Go again to make it clean.` : "Perfect: line complete with no mistakes.", tone: mistakes ? undefined : "good" }));
      void ctx.write("create", "opening_drills", { opening: op.id, name: op.name, side: op.side, mistakes, moves: line.length });
      queueMicrotask(() => setRunning(false));
    }
  }, [running, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const onMove = (from: string, to: string) => {
    if (!running || done || pos.turn() !== mySide) return;
    const g = new Chess(pos.fen());
    let san = "";
    try { san = g.move({ from, to, promotion: "q" }).san; } catch { return; }
    if (san === line[ply]) { setMsg({ t: `${san} ✓`, tone: "good" }); setHint(false); setPly(ply + 1); }
    else { setMistakes((m) => m + 1); setMsg({ t: `${san} isn't the book move here. Try again${mistakes >= 1 ? ` (it's ${line[ply]})` : ""}.`, tone: "bad" }); }
  };
  const expected = !done && running && pos.turn() === mySide ? (() => { const g = new Chess(pos.fen()); try { const m = g.move(line[ply]); return { from: m.from, to: m.to }; } catch { return null; } })() : null;
  const last = (() => { const h = pos.history({ verbose: true }); return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null; })();
  return (
    <div className={c.wrap}>
      <div className={c.boardCol}><Board fen={pos.fen()} orientation={op.side} onMove={onMove} lastMove={last} hint={hint ? expected : null} interactive={running} /></div>
      <div className={c.side}>
        <select className={c.sel} value={op.id} onChange={(e) => { setOp(OPENINGS.find((o) => o.id === e.target.value)!); setPly(0); setRunning(false); setMsg(null); }}>
          <optgroup label="As White">{OPENINGS.filter((o) => o.side === "white").map((o) => <option key={o.id} value={o.id}>{o.name} · {stats(o.id)}</option>)}</optgroup>
          <optgroup label="As Black">{OPENINGS.filter((o) => o.side === "black").map((o) => <option key={o.id} value={o.id}>{o.name} · {stats(o.id)}</option>)}</optgroup>
        </select>
        <div className={c.msg}><b>{op.name}</b> <span className="label">{op.eco} · you play {op.side}</span><br />{op.idea}</div>
        {msg && <div className={c.msg} data-tone={msg.tone}>{msg.t}</div>}
        <div className={c.moves}>{line.slice(0, ply).map((m, i) => <button key={i}>{i % 2 === 0 && <em>{i / 2 + 1}.</em>}{m}</button>)}{!done && running && <button data-on="true">…</button>}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="pill" data-active="true" onClick={() => { setPly(0); setMistakes(0); setMsg(null); setHint(false); setRunning(true); }}>{running ? "Restart" : "Start drill"}</button>
          {running && !done && <button className="pill" onClick={() => setHint(true)}>Hint</button>}
          <button className="pill" onClick={() => submit(`Explain the ideas, typical plans and common traps of the ${op.name} after ${line.join(" ")}. Keep it practical for a club player.`, { thread: "chess:openings" })}>Explain with Apollo</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= puzzles ======================= */
type Puzzle = { id: string; fen: string; solution: string[]; rating?: number; themes?: string[]; source: "lichess" | "mine"; note?: string };
const THEMES = ["mix", "mateIn1", "mateIn2", "mateIn3", "fork", "pin", "skewer", "discoveredAttack", "sacrifice", "deflection", "attraction", "hangingPiece", "trappedPiece", "endgame", "rookEndgame", "promotion", "defensiveMove", "quietMove", "crushing"];
const RKEY = "noesis.puzzleRating";

async function lichessPuzzle(theme: string, difficulty: string): Promise<Puzzle> {
  const r = await fetch(`https://lichess.org/api/puzzle/next?angle=${theme}&difficulty=${difficulty}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`lichess answered ${r.status}`);
  const j = await r.json();
  const sans = sansOf(j.game.pgn);
  // The puzzle starts after the game's moves; fall back to initialPly+1 if the first solution move isn't legal.
  for (const n of [sans.length, (j.puzzle.initialPly ?? sans.length - 1) + 1]) {
    const g = new Chess();
    for (const m of sans.slice(0, n)) g.move(m);
    try { new Chess(g.fen()).move(uciMove(j.puzzle.solution[0])); return { id: j.puzzle.id, fen: g.fen(), solution: j.puzzle.solution, rating: j.puzzle.rating, themes: j.puzzle.themes, source: "lichess" }; } catch {}
  }
  throw new Error("couldn't set up that puzzle");
}

export function Puzzles({ ctx }: { ctx: BlockCtx }) {
  const mine = (ctx.data?.rows ?? []) as Row[];
  const [source, setSource] = useState<"lichess" | "mine">("lichess");
  const [theme, setTheme] = useState("mix");
  const [diff, setDiff] = useState("normal");
  const [pz, setPz] = useState<Puzzle | null>(null);
  const [step, setStep] = useState(0);
  const [fen, setFen] = useState<string | null>(null);
  const [state, setState] = useState<"play" | "wrong" | "solved" | "shown">("play");
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(1500);
  const failed = useRef(false);
  useEffect(() => { try { const r = Number(localStorage.getItem(RKEY)); if (r) queueMicrotask(() => setRating(r)); } catch {} }, []);

  const next = async () => {
    setErr(null); setState("play"); setStep(0); failed.current = false;
    try {
      let p: Puzzle;
      if (source === "mine") {
        if (!mine.length) throw new Error("No puzzles from your games yet. Review a game first: your mistakes become puzzles.");
        const r = mine[Math.floor(Math.random() * mine.length)];
        p = { id: r.id, fen: r.fen, solution: r.solution, source: "mine", note: r.note };
      } else p = await lichessPuzzle(theme, diff);
      setPz(p); setFen(p.fen);
    } catch (e) { setErr((e as Error).message); }
  };
  const record = (solved: boolean) => {
    if (!pz) return;
    if (pz.rating) {
      const exp = 1 / (1 + 10 ** ((pz.rating - rating) / 400));
      const nr = Math.round(rating + 24 * ((solved ? 1 : 0) - exp));
      setRating(nr);
      try { localStorage.setItem(RKEY, String(nr)); } catch {}
    }
    void ctx.write("create", "puzzle_attempts", { source: pz.source, puzzle_id: pz.id, rating: pz.rating ?? null, solved, themes: (pz.themes ?? []).join(" ") });
  };
  const onMove = (from: string, to: string) => {
    if (!pz || !fen || state === "solved" || state === "shown") return;
    const g = new Chess(fen);
    let mv;
    try { mv = g.move({ from, to, promotion: "q" }); } catch { return; }
    const want = pz.solution[step];
    const ok = mv.from + mv.to === want.slice(0, 4) || g.isCheckmate();
    if (!ok) { setState("wrong"); if (!failed.current) { failed.current = true; record(false); } return; }
    setState("play");
    if (g.isCheckmate() || step + 1 >= pz.solution.length) { setFen(g.fen()); setState("solved"); if (!failed.current) record(true); return; }
    // opponent's reply
    const reply = pz.solution[step + 1];
    setFen(g.fen());
    setTimeout(() => { const h = new Chess(g.fen()); try { h.move(uciMove(reply)); } catch {} setFen(h.fen()); setStep(step + 2); }, 350);
  };
  const toMove = fen ? (new Chess(fen).turn() === "w" ? "white" : "black") : "white";
  const orientation = pz ? (new Chess(pz.fen).turn() === "w" ? "white" : "black") : "white";
  return (
    <div className={c.wrap}>
      <div className={c.boardCol}>{fen ? <Board fen={fen} orientation={orientation} onMove={onMove} interactive={state === "play" || state === "wrong"} /> : <div className={c.msg} style={{ flex: 1 }}>Pick a theme and press <b>Next puzzle</b>.</div>}</div>
      <div className={c.side}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <select className={c.sel} value={source} onChange={(e) => setSource(e.target.value as "lichess" | "mine")}><option value="lichess">Lichess puzzles</option><option value="mine">From my games ({mine.length})</option></select>
          {source === "lichess" && <select className={c.sel} value={theme} onChange={(e) => setTheme(e.target.value)}>{THEMES.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
          {source === "lichess" && <select className={c.sel} value={diff} onChange={(e) => setDiff(e.target.value)}>{["easiest", "easier", "normal", "harder", "hardest"].map((t) => <option key={t}>{t}</option>)}</select>}
        </div>
        <div className="label">Your puzzle rating {rating}{pz?.rating ? ` · this puzzle ${pz.rating}` : ""}</div>
        {err && <div className={c.msg} data-tone="bad">{err}</div>}
        {pz && <div className={c.msg} data-tone={state === "solved" ? "good" : state === "wrong" ? "bad" : undefined}>
          {state === "solved" ? "Solved ✓" : state === "wrong" ? "Not that one. Try again, or show the solution." : state === "shown" ? `Solution: ${(() => { const g = new Chess(pz.fen); return pz.solution.map((u) => { try { return g.move(uciMove(u)).san; } catch { return u; } }).join(" "); })()}` : `Find the best move for ${toMove}.`}
          {pz.note && <><br /><small>{pz.note}</small></>}
          {pz.themes && state !== "play" && <><br /><small>{pz.themes.join(", ")}</small></>}
        </div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="pill" data-active="true" onClick={next}>Next puzzle</button>
          {pz && state !== "solved" && <button className="pill" onClick={() => { if (!failed.current) { failed.current = true; record(false); } setState("shown"); }}>Show solution</button>}
          {pz && <button className="pill" onClick={() => { setFen(pz.fen); setStep(0); setState("play"); }}>Retry</button>}
        </div>
      </div>
    </div>
  );
}

/* ======================= game review ======================= */
export function GameReview({ ctx, p }: { ctx: BlockCtx; p: P }) {
  const engine = useEngine();
  const { submit } = useApollo();
  const games = (ctx.data?.rows ?? []) as Row[];
  const [pick, setPick] = useState<string>("");
  const [pgn, setPgn] = useState("");
  const [me, setMe] = useState<"w" | "b">("w");
  const [prog, setProg] = useState<[number, number] | null>(null);
  const [rev, setRev] = useState<Review | null>(null);
  const [idx, setIdx] = useState(0);
  const [game, setGame] = useState<Row | null>(null);

  const run = async () => {
    if (!engine) return;
    const g = games.find((x) => x.id === pick) ?? null;
    const text = g?.pgn ?? pgn;
    const sans = sansOf(text ?? "");
    if (!sans.length) return alert("Pick a synced game or paste a PGN.");
    const side = g ? (g.color === "black" ? "b" : "w") : me;
    setGame(g); setMe(side); setRev(null); setProg([0, sans.length + 1]);
    const r = await reviewGame(sans, (fen) => engine.analyse(fen, { depth: p.depth ?? 12, multipv: 2 }), (d, t) => setProg([d, t]));
    setRev(r); setIdx(0); setProg(null);
    if (g) void ctx.write("update", "chess_games", { review: { accuracy: r.accuracy, counts: r.counts } }, g.id);
    for (const pz of puzzlesFromReview(r, side).slice(0, 10)) {
      const g2 = new Chess(pz.fen);
      let uci = "";
      try { const m = g2.move(pz.solution[0]); uci = m.from + m.to + (m.promotion ?? ""); } catch { continue; }
      void ctx.write("create", "chess_puzzles", { fen: pz.fen, solution: [uci], note: `From your game: you played ${pz.played} (${CLS[pz.cls].label.toLowerCase()}).`, source: g?.url ?? "pasted" });
    }
  };
  const ply = rev && idx > 0 ? rev.plies[idx - 1] : null;
  const fen = useMemo(() => {
    if (!rev) return new Chess().fen();
    const g = new Chess();
    for (const p2 of rev.plies.slice(0, idx)) g.move(p2.san);
    return g.fen();
  }, [rev, idx]);
  const marks: Record<string, Mark> = {};
  if (ply) { const to = ply.uci.slice(2, 4); marks[to] = { label: CLS[ply.cls].sym, color: CLS[ply.cls].color }; }
  const graph = rev ? rev.plies.map((x) => winPct(x.after)) : [];
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!rev || (e.target as HTMLElement)?.closest?.("input,textarea,select")) return;
      if (e.key === "ArrowRight") setIdx((i) => Math.min(rev.plies.length, i + 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [rev]);
  return (
    <div className={c.wrap}>
      <div className={c.boardCol}>
        <EvalBar pct={ply ? winPct(ply.after) : 50} label={ply ? fmtEval(ply.after) : "0.0"} />
        <Board fen={fen} orientation={me === "w" ? "white" : "black"} interactive={false} marks={marks}
          lastMove={ply ? { from: ply.uci.slice(0, 2), to: ply.uci.slice(2, 4) } : null}
          hint={ply && ply.bestSan && ply.cls !== "best" && ply.cls !== "book" && ply.cls !== "brilliant" && ply.cls !== "great" ? (() => { const g = new Chess(ply.fenBefore); try { const m = g.move(ply.bestSan!); return { from: m.from, to: m.to }; } catch { return null; } })() : null} />
      </div>
      <div className={c.side}>
        {!rev && !prog && (
          <>
            <select className={c.sel} value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">{games.length ? "Choose a synced game…" : "No synced games yet: paste a PGN below"}</option>
              {games.map((g) => <option key={g.id} value={g.id}>{new Date(g.created_at).toLocaleDateString("en-GB")} · {g.result} vs {g.opponent} ({g.time_class})</option>)}
            </select>
            {!pick && <><textarea className={c.input} rows={4} placeholder="…or paste a PGN" value={pgn} onChange={(e) => setPgn(e.target.value)} />
              <select className={c.sel} value={me} onChange={(e) => setMe(e.target.value as "w" | "b")}><option value="w">I was White</option><option value="b">I was Black</option></select></>}
            <button className="pill" data-active="true" disabled={!engine} onClick={run}>Review game</button>
          </>
        )}
        {prog && <div className={c.msg}>Analysing with Stockfish… {prog[0]}/{prog[1]} positions</div>}
        {rev && (
          <>
            <div className={c.counts}>
              <span /><b>White {rev.accuracy.w}</b><b>Black {rev.accuracy.b}</b>
              {CLS_ORDER.map((k) => (
                <span key={k} style={{ display: "contents" }}>
                  <span><i className={c.cls} style={{ background: CLS[k].color }}>{CLS[k].sym}</i> {CLS[k].label}</span>
                  <b>{rev.counts.w[k] ?? 0}</b><b>{rev.counts.b[k] ?? 0}</b>
                </span>
              ))}
            </div>
            <svg className={c.graph} viewBox={`0 0 ${Math.max(1, graph.length)} 100`} preserveAspectRatio="none"
              onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setIdx(Math.round(((e.clientX - r.left) / r.width) * graph.length)); }}>
              <rect x="0" y="0" width={graph.length} height="100" fill="#222" />
              <path d={`M0,100 ${graph.map((v, i) => `L${i + 1},${100 - v}`).join(" ")} L${graph.length},100 Z`} fill="#eee" />
              <line x1={idx} x2={idx} y1="0" y2="100" stroke="var(--accent)" strokeWidth={Math.max(0.3, graph.length / 200)} />
            </svg>
            {ply && <div className={c.msg} style={{ borderLeft: `3px solid ${CLS[ply.cls].color}` }}>
              <b>{ply.san}</b> is {/^[aeiou]/i.test(CLS[ply.cls].label) ? "an" : "a"} <b style={{ color: CLS[ply.cls].color }}>{CLS[ply.cls].label.toLowerCase()}</b> move{ply.loss >= 2 ? ` (−${ply.loss}% win chance)` : ""}.
              {ply.bestSan && ply.bestSan !== ply.san && <> Best was <b>{ply.bestSan}</b>: {ply.bestLine.join(" ")}</>}
            </div>}
            <div className={c.moves}>
              {rev.plies.map((x, i) => (
                <button key={i} data-on={i + 1 === idx} onClick={() => setIdx(i + 1)}>
                  {i % 2 === 0 && <em>{i / 2 + 1}.</em>}{x.san}
                  {!["best", "excellent", "good", "book"].includes(x.cls) && <i className={c.cls} style={{ background: CLS[x.cls].color }}>{CLS[x.cls].sym}</i>}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="pill" onClick={() => setIdx((i) => Math.max(0, i - 1))}>◀</button>
              <button className="pill" onClick={() => setIdx((i) => Math.min(rev.plies.length, i + 1))}>▶</button>
              <button className="pill" onClick={() => {
                const bad = rev.plies.map((x, i) => ({ ...x, n: Math.floor(i / 2) + 1 })).filter((x) => x.color === me && ["inaccuracy", "mistake", "miss", "blunder"].includes(x.cls));
                submit(`Explain my chess game like a coach (I was ${me === "w" ? "White" : "Black"}${game ? ` vs ${game.opponent}` : ""}). Accuracy W ${rev.accuracy.w} / B ${rev.accuracy.b}. Moves: ${rev.plies.map((x) => x.san).join(" ")}. My flagged moves (computed by Stockfish): ${bad.map((x) => `${x.n}. ${x.san} = ${x.cls}, best ${x.bestSan} (${x.bestLine.join(" ")})`).join("; ") || "none"}. Explain the 3 key moments and what to learn. Don't change the classifications.`, { thread: "chess:review" });
              }}>Explain with Apollo</button>
              <button className="pill" onClick={() => { setRev(null); setGame(null); }}>Another game</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
