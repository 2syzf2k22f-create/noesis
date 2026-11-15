"use client";
// Chess: analysis board (and play vs Stockfish), opening trainer, puzzles, game review.

import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { usePersist } from "@/ui/usePersist";
import { useScreenContext } from "@/shell/screen";
import type { BlockCtx } from "@/ui/Blocks";
import { Board, EvalBar, StylePicker, type Arrow, type Mark } from "./Board";
import { Engine, fmtEval, winPct, type Analysis } from "./engine";
import { OPENINGS, type Opening } from "./openings";
import { THEORY } from "./theory";
import { IDEAS } from "./ideas";
import { REVIEW_VERSION, BAD_CLS, CLS, CLS_ORDER, KEY_CLS, TC_EXPECT, classifyLoss, puzzlesFromReview, reviewGame, uciLineToSan, type Cls, type Phase, type Review } from "./review";
import c from "./chess.module.css";
import u2 from "@/ui/ui.module.css";

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
/** Start FEN from a PGN's [FEN] header, if any. */
const fenOfPgn = (pgn: string) => /\[FEN "([^"]+)"\]/.exec(pgn)?.[1];
async function saveRecord(op: "create" | "update", table: string, data: P, id?: string): Promise<Row | null> {
  return fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, table, data, id }) })
    .then((r) => (r.ok ? r.json() : null)).catch(() => null);
}
function buildPgn(o: { start: string; moves: string[]; white: string; black: string; result: string; event: string }) {
  const g = new Chess(o.start);
  for (const m of o.moves) g.move(m);
  const tag = (k: string, v: string) => `[${k} "${v}"]`;
  const head = [tag("Event", o.event), tag("Site", "NOESIS"), tag("Date", new Date().toISOString().slice(0, 10).replace(/-/g, ".")), tag("White", o.white), tag("Black", o.black), tag("Result", o.result)];
  if (o.start !== new Chess().fen()) head.push(tag("SetUp", "1"), tag("FEN", o.start));
  const body = g.pgn().replace(/^(\[.*\]\s*)+/m, "").trim();
  return `${head.join("\n")}\n\n${body} ${o.result}`;
}
/** Numbered move list text from a start FEN. */
function moveLabel(start: string, i: number) {
  const [, side, , , , full] = start.split(" ");
  const ply = (Number(full || 1) - 1) * 2 + (side === "b" ? 1 : 0) + i;
  return ply % 2 === 0 ? `${ply / 2 + 1}.` : i === 0 ? `${(ply - 1) / 2 + 1}...` : "";
}

/* ======================= analysis board / play vs engine ======================= */
const ELOS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400, 2700, 3000];
const CLOCKS: { label: string; base: number; inc: number; cls: string }[] = [
  { label: "No clock", base: 0, inc: 0, cls: "untimed" }, { label: "1 + 0", base: 60, inc: 0, cls: "bullet" }, { label: "3 + 2", base: 180, inc: 2, cls: "blitz" },
  { label: "5 + 0", base: 300, inc: 0, cls: "blitz" }, { label: "10 + 0", base: 600, inc: 0, cls: "rapid" }, { label: "15 + 10", base: 900, inc: 10, cls: "rapid" },
  { label: "30 + 0", base: 1800, inc: 0, cls: "rapid" },
];
type Play = { elo: number; me: "w" | "b"; clock: { base: number; inc: number; cls: string }; startFen: string; over: string | null; result?: "win" | "loss" | "draw" };
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}${s < 20 && s > 0 ? `.${Math.floor((s % 1) * 10)}` : ""}`;

export function AnalysisBoard({ ctx, p }: { ctx?: BlockCtx; p?: P }) {
  const engine = useEngine();
  const { submit } = useApollo();
  const [start, setStart] = usePersist("chess.start", () => new Chess().fen());
  const [moves, setMoves] = usePersist<string[]>("chess.moves", []);
  const [idx, setIdx] = usePersist("chess.idx", 0);
  const [flip, setFlip] = usePersist("chess.flip", false);
  const [an, setAn] = useState<Analysis | null>(null);
  const [load, setLoad] = useState("");
  const [play, setPlay] = usePersist<Play | null>("chess.play", null);
  const [setup, setSetup] = usePersist("chess.setup", { elo: 1200, color: "w" as "w" | "b" | "random", clock: 0 });
  const [clocks, setClocks] = usePersist<{ w: number; b: number }>("chess.clocks", { w: 0, b: 0 });
  const [thinking, setThinking] = useState(false);
  const [popup, setPopup] = useState(false);
  const [reviewing, setReviewing] = usePersist<{ sans: string[]; startFen: string; me: "w" | "b"; gameId: string | null; title: string } | null>("chess.reviewing", null);
  const [savedId, setSavedId] = usePersist<string | null>("chess.savedId", null);
  const [lines, setLines] = useState(3);
  const saved = useRef(false);
  const pos = useMemo(() => {
    const g = new Chess(start);
    for (const m of moves.slice(0, idx)) g.move(m);
    return g;
  }, [start, moves, idx]);
  const fen = pos.fen();
  const last = useMemo(() => { const h = pos.history({ verbose: true }); return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null; }, [pos]);
  const playing = !!play && !play.over;
  useScreenContext("chess board", `FEN ${fen}; ${pos.turn() === "w" ? "White" : "Black"} to move; moves so far: ${moves.slice(0, idx).join(" ") || "none"}${play ? `; playing Stockfish ${play.elo} as ${play.me === "w" ? "White" : "Black"}${play.over ? ` (game over: ${play.over})` : ""}` : an?.lines[0] ? `; engine eval ${fmtEval(an.lines[0])}, best ${an.best}` : ""}`);

  // live analysis (only when not playing, so it can't help you)
  useEffect(() => {
    if (!engine || pos.isGameOver() || playing) return;
    let live = true;
    engine.analyse(fen, { depth: 18, multipv: lines, onUpdate: (a) => { if (live) setAn(a); } }).then((a) => { if (live) setAn(a); });
    return () => { live = false; engine.stop(); };
  }, [engine, fen, pos, playing, lines]);

  const push = useCallback((san: string) => { setMoves((ms) => [...ms.slice(0, idx), san]); setIdx((i) => i + 1); }, [idx]);

  const finish = useCallback((result: "win" | "loss" | "draw", how: string) => {
    setPlay((pl) => (pl ? { ...pl, over: how, result } : pl));
    setPopup(true);
    if (saved.current || !play) return;
    saved.current = true;
    const score = result === "draw" ? 0.5 : result === "win" ? 1 : 0;
    const played = moves.slice(0, idx);
    void ctx?.write("create", "chess_practice", { elo: play.elo, color: play.me === "w" ? "white" : "black", result, score, how, moves: played.join(" "), start_fen: play.startFen, plies: idx });
    // and into "your games", so it can be reviewed later
    const bot = `Stockfish ${play.elo}`;
    const pgnResult = result === "draw" ? "1/2-1/2" : (result === "win") === (play.me === "w") ? "1-0" : "0-1";
    const pgn = buildPgn({ start: play.startFen, moves: played, white: play.me === "w" ? "You" : bot, black: play.me === "b" ? "You" : bot, result: pgnResult, event: `Practice vs ${bot}` });
    void saveRecord("create", "chess_games", { time_class: play.clock.cls, color: play.me === "w" ? "white" : "black", result, opponent: bot, opponent_rating: play.elo, pgn, url: null }).then((row) => { if (row?.id) setSavedId(row.id); });
  }, [ctx, play, moves, idx]);

  // game end detection
  useEffect(() => {
    if (!playing || !play) return;
    if (pos.isCheckmate()) queueMicrotask(() => finish(pos.turn() === play.me ? "loss" : "win", pos.turn() === play.me ? "Stockfish won by checkmate" : "You won by checkmate"));
    else if (pos.isDraw()) queueMicrotask(() => finish("draw", pos.isStalemate() ? "Draw by stalemate" : pos.isThreefoldRepetition() ? "Draw by repetition" : pos.isInsufficientMaterial() ? "Draw: insufficient material" : "Draw by the 50-move rule"));
  }, [pos, playing, play, finish]);

  // engine replies
  useEffect(() => {
    if (!playing || !play || !engine || pos.isGameOver() || pos.turn() === play.me || idx !== moves.length) return;
    let live = true;
    queueMicrotask(() => setThinking(true));
    const t0 = Date.now();
    engine.humanMove(fen, play.elo).then(({ move, thinkMs }) => {
      const wait = Math.max(0, thinkMs - (Date.now() - t0));
      setTimeout(() => {
        if (!live || !move) return;
        setThinking(false);
        if (play.clock.base) {
          const side = play.me === "w" ? "b" : "w";
          let flagged = false;
          setClocks((k) => { const v = k[side] - (Date.now() - t0) / 1000; flagged = v <= 0; return { ...k, [side]: flagged ? 0 : v + play.clock.inc }; });
          if (flagged) return finish("win", "You won on time");
        }
        const g = new Chess(fen);
        try { push(g.move(uciMove(move)).san); } catch {}
      }, wait);
    });
    return () => { live = false; };
  }, [playing, play, engine, fen, pos, push, idx, moves.length, finish]);

  // your clock ticks on your turn
  useEffect(() => {
    if (!playing || !play?.clock.base || pos.turn() !== play.me) return;
    const id = setInterval(() => setClocks((k) => {
      const v = k[play.me] - 0.1;
      if (v <= 0) { queueMicrotask(() => finish("loss", "Stockfish won on time")); return { ...k, [play.me]: 0 }; }
      return { ...k, [play.me]: v };
    }), 100);
    return () => clearInterval(id);
  }, [playing, play, pos, finish]);

  // arrow keys step through moves
  useEffect(() => {
    if (reviewing) return;
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (e.key === "ArrowRight") setIdx((i) => Math.min(moves.length, i + 1));
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [moves.length, reviewing]);

  const onMove = (from: string, to: string, promotion?: string) => {
    if (playing && pos.turn() !== play!.me) return;
    if (playing && idx !== moves.length) return; // can't move while browsing back in a game
    const g = new Chess(fen);
    try {
      push(g.move({ from, to, promotion: promotion ?? "q" }).san);
      if (playing && play!.clock.inc) setClocks((k) => ({ ...k, [play!.me]: k[play!.me] + play!.clock.inc }));
    } catch {}
  };
  const startGame = (fromHere: boolean) => {
    const me = setup.color === "random" ? (Math.random() < 0.5 ? "w" : "b") : setup.color;
    const sf = fromHere ? fen : new Chess().fen();
    const clock = CLOCKS[setup.clock];
    saved.current = false;
    setSavedId(null); setPopup(false); setAn(null);
    setStart(sf); setMoves([]); setIdx(0); setFlip(me === "b");
    setClocks({ w: clock.base, b: clock.base });
    setPlay({ elo: setup.elo, me, clock: { base: clock.base, inc: clock.inc, cls: clock.cls }, startFen: sf, over: null });
  };
  const openReview = () => {
    if (!play) return;
    setPopup(false);
    setReviewing({ sans: moves, startFen: play.startFen, me: play.me, gameId: savedId, title: `vs Stockfish ${play.elo} · ${play.over ?? ""}` });
  };

  if (reviewing)
    return (
      <div className={c.reviewHost}>
        <div className={c.toolbar}>
          <button className="pill" onClick={() => setReviewing(null)}>← Back to the board</button>
          <span className="label">{reviewing.title}</span>
        </div>
        <GameReview ctx={ctx} p={{}} initial={reviewing} />
      </div>
    );

  const top = an?.lines[0];
  const pct = playing ? 50 : winPct(top);
  const bestArrows: Arrow[] = !play || play.over ? (an?.lines ?? []).slice(0, 1).filter((l) => l.pv[0]).map((l) => ({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), color: "green" })) : [];
  const resultTone = play?.result === "win" ? "good" : play?.result === "loss" ? "bad" : undefined;
  return (
    <div className={c.wrap}>
      <div className={c.boardCol}>
        {(!play || play.over) && <EvalBar pct={pct} label={fmtEval(top)} />}
        <div className={c.boardStack}>
          {play && <div className={c.player} data-active={playing && pos.turn() !== play.me}><span><i className={c.avatar} data-bot="true" />Stockfish {play.elo}</span>{play.clock.base > 0 && <b className={c.clock} data-low={clocks[play.me === "w" ? "b" : "w"] < 20}>{mmss(clocks[play.me === "w" ? "b" : "w"])}</b>}</div>}
          <Board fen={fen} orientation={flip ? "black" : "white"} onMove={onMove} lastMove={last} arrows={bestArrows} />
          {play && <div className={c.player} data-active={playing && pos.turn() === play.me}><span><i className={c.avatar} />You</span>{play.clock.base > 0 && <b className={c.clock} data-low={clocks[play.me] < 20}>{mmss(clocks[play.me])}</b>}</div>}
          {popup && play?.over && (
            <div className={c.overlay} role="dialog" aria-label="Game over">
              <div className={c.overCard}>
                <button className={c.overX} onClick={() => setPopup(false)} aria-label="Close">✕</button>
                <div className={c.overHead} data-tone={resultTone}>
                  <b>{play.result === "win" ? "You won!" : play.result === "loss" ? "Stockfish won" : "Draw"}</b>
                  <small>{play.over}</small>
                </div>
                <div className={c.overVs}>
                  <span><i className={c.avatar} />You</span><em>vs</em><span><i className={c.avatar} data-bot="true" />Stockfish {play.elo}</span>
                </div>
                <button className={c.reviewBtn} onClick={openReview}>★ Game Review</button>
                <div className={c.overRow}>
                  <button className="pill" onClick={() => startGame(false)}>Rematch</button>
                  <button className="pill" onClick={() => { setPopup(false); setPlay(null); setMoves([]); setIdx(0); setStart(new Chess().fen()); }}>New game</button>
                  <button className="pill" onClick={() => { setPopup(false); setPlay(null); }}>Analyse</button>
                </div>
                <small className="label">{savedId ? "Saved to your games." : "Saving to your games…"}</small>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className={c.side}>
        <div className={c.toolbar}>
          <StylePicker />
          <button className="pill" onClick={() => setFlip((f) => !f)}>Flip</button>
          {!playing && <button className="pill" onClick={() => submit(`Explain this chess position to me: what's going on, the plans for both sides and the best move. FEN: ${fen}. Moves: ${moves.slice(0, idx).join(" ") || "start"}. Stockfish says ${fmtEval(top)}, best ${an?.best ?? "?"} (lines: ${(an?.lines ?? []).map((l) => `${fmtEval(l)} ${uciLineToSan(fen, l.pv, 6).join(" ")}`).join(" | ")}). Use annotate_board to draw arrows for the key ideas.`, { thread: "chess:analysis" })}>Ask Apollo</button>}
        </div>
        {play ? (
          <div className={c.status} data-tone={play.over ? resultTone : undefined}>
            {play.over ?? (thinking ? `Stockfish (${play.elo}) is thinking…` : `Your move (${play.me === "w" ? "White" : "Black"})`)}
          </div>
        ) : (
          <>
            <div className={c.status}>
              {pos.isCheckmate() ? "Checkmate" : pos.isDraw() ? "Draw" : `${pos.turn() === "w" ? "White" : "Black"} to move`} · <b>{fmtEval(top)}</b>{top ? ` · depth ${top.depth}` : ""}
              <select className={c.mini} value={lines} onChange={(e) => setLines(Number(e.target.value))} aria-label="Engine lines">{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} line{n > 1 ? "s" : ""}</option>)}</select>
            </div>
            {/* fixed height: one slot per line, so nothing below ever moves */}
            <div className={c.lines} style={{ ["--n" as string]: lines }}>
              {Array.from({ length: lines }, (_, i) => an?.lines[i]).map((l, i) => (
                <div key={i} className={c.line} onClick={() => { if (!l?.pv[0]) return; const m = uciMove(l.pv[0]); onMove(m.from, m.to, l.pv[0][4]); }} title={l ? "Click to play the first move" : undefined}>
                  <b data-neg={(l?.cp ?? 0) < 0 || (l?.mate ?? 1) < 0}>{l ? fmtEval(l) : "…"}</b>
                  <span>{l ? uciLineToSan(fen, l.pv, 10).join(" ") : ""}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div className={c.moveList}>
          {moves.length === 0 ? <span className="label">No moves yet. Drag a piece, or play Stockfish below.</span> : moves.map((m, i) => {
            const label = moveLabel(start, i);
            return <button key={i} data-on={i + 1 === idx} onClick={() => setIdx(i + 1)}>{label && <em>{label}</em>}{m}</button>;
          })}
        </div>
        <div className={c.nav}>
          <button onClick={() => setIdx(0)} aria-label="First move">⏮</button>
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} aria-label="Previous move">◀</button>
          <button onClick={() => setIdx((i) => Math.min(moves.length, i + 1))} aria-label="Next move">▶</button>
          <button onClick={() => setIdx(moves.length)} aria-label="Last move">⏭</button>
        </div>
        {play && (
          <div className={c.toolbar}>
            {playing && <button className="pill" onClick={() => finish("loss", "You resigned")}>Resign</button>}
            {playing && <button className="pill" onClick={() => {
              // the bot accepts a draw only when it isn't better
              const ev = an?.lines[0];
              const botBetter = ev ? (play.me === "w" ? (ev.cp ?? 0) < -80 : (ev.cp ?? 0) > 80) : false;
              if (botBetter) alert("Stockfish declines the draw."); else finish("draw", "Draw agreed");
            }}>Offer draw</button>}
            {play.over && <button className={c.reviewBtnSm} onClick={openReview}>★ Game Review</button>}
            {play.over && <button className="pill" onClick={() => startGame(false)}>Rematch</button>}
            {play.over && <button className="pill" onClick={() => setPlay(null)}>Analyse freely</button>}
          </div>
        )}
        {!playing && (
          <div className={c.playBox}>
            <div className="label">Play Stockfish</div>
            <div className={c.toolbar}>
              <select className={c.sel} value={setup.elo} onChange={(e) => setSetup({ ...setup, elo: Number(e.target.value) })}>{ELOS.map((e) => <option key={e} value={e}>{e} Elo</option>)}</select>
              <select className={c.sel} value={setup.color} onChange={(e) => setSetup({ ...setup, color: e.target.value as "w" | "b" | "random" })}><option value="w">I play White</option><option value="b">I play Black</option><option value="random">Random colour</option></select>
              <select className={c.sel} value={setup.clock} onChange={(e) => setSetup({ ...setup, clock: Number(e.target.value) })}>{CLOCKS.map((k, i) => <option key={k.label} value={i}>{k.label}</option>)}</select>
            </div>
            <div className={c.toolbar}>
              <button className="pill" data-active="true" onClick={() => startGame(false)}>New game</button>
              <button className="pill" onClick={() => startGame(true)} title="Start a game from the position on the board">Play from this position</button>
              <button className="pill" onClick={() => { setPlay(null); setMoves([]); setIdx(0); setStart(new Chess().fen()); }}>Clear board</button>
            </div>
            <textarea className={c.input} rows={2} placeholder="Paste a PGN or FEN to load it (then analyse, review or play from it)" value={load} onChange={(e) => setLoad(e.target.value)} />
            <div className={c.toolbar}>
              <button className="pill" onClick={() => {
                const t = load.trim();
                setPlay(null);
                if (/^([rnbqkpRNBQKP1-8]+\/){7}/.test(t)) { try { new Chess(t); setStart(t); setMoves([]); setIdx(0); } catch {} }
                else { const sf = fenOfPgn(t) ?? new Chess().fen(); const ms = sansOf(t); setStart(sf); setMoves(ms); setIdx(ms.length); }
                setLoad("");
              }}>Load</button>
              {moves.length > 1 && <button className="pill" onClick={() => setReviewing({ sans: moves, startFen: start, me: flip ? "b" : "w", gameId: null, title: "Board game" })}>Review these moves</button>}
            </div>
          </div>
        )}
        {p?.note && <small className="label">{String(p.note)}</small>}
      </div>
    </div>
  );
}

/* ======================= opening trainer ======================= */
// Explore: a tree of theory. At every position you see each reply the opponent can choose and the
// book answer to it; play any move yourself (off-book moves get Stockfish's opinion).
// Drill: each run follows a different branch, the opponent picking among the book replies.
type TNode = { san: string; names: string[]; kids: TNode[] };
function buildTree(op: Opening): TNode {
  const root: TNode = { san: "", names: [], kids: [] };
  const lines = [{ line: op.moves, name: "Main line" }, ...(THEORY[op.id] ?? [])];
  for (const l of lines) {
    let n = root;
    for (const m of l.line.split(" ")) {
      let k = n.kids.find((x) => x.san === m);
      if (!k) { k = { san: m, names: [], kids: [] }; n.kids.push(k); }
      if (!k.names.includes(l.name)) k.names.push(l.name);
      n = k;
    }
  }
  return root;
}
const walk = (root: TNode, path: string[]) => { let n: TNode | null = root; for (const m of path) { n = n?.kids.find((k) => k.san === m) ?? null; if (!n) break; } return n; };
const leaves = (n: TNode): number => (n.kids.length ? n.kids.reduce((a, k) => a + leaves(k), 0) : 1);
const sq = (fen: string, san: string) => { try { const m = new Chess(fen).move(san); return { from: m.from, to: m.to }; } catch { return null; } };

/** A free analysis board beside the practice: starts at the practice position, try anything,
 *  Stockfish's top 3 lines and the eval update as you go. It never changes the practice board. */
function SideAnalysis({ fen: start, orientation }: { fen: string; orientation: "white" | "black" }) {
  const engine = useEngine();
  const [moves, setMoves] = useState<string[]>([]);
  const [base, setBase] = useState(start);
  const [follow, setFollow] = useState(true);
  const [a, setA] = useState<{ fen: string; an: Analysis } | null>(null);
  // follow the practice position until you start trying your own moves
  if (follow && base !== start) { setBase(start); setMoves([]); }
  const pos = useMemo(() => { const g = new Chess(base); for (const m of moves) { try { g.move(m); } catch { break; } } return g; }, [base, moves]);
  const fen = pos.fen();
  useEffect(() => {
    if (!engine || pos.isGameOver()) return;
    let live = true;
    void engine.analyse(fen, { depth: 18, multipv: 3, onUpdate: (an) => { if (live) setA({ fen, an }); } }).then((an) => { if (live) setA({ fen, an }); }).catch(() => {});
    return () => { live = false; };
  }, [engine, fen, pos]);
  const cur = a?.fen === fen ? a.an : null;
  const top = cur?.lines[0];
  const last = (() => { const h = pos.history({ verbose: true }); return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null; })();
  const arrows: Arrow[] = (cur?.lines ?? []).slice(0, 3).map((l, i) => ({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), color: i === 0 ? "#3fb950" : "#3fb95066" }));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u2.row}><b>Analysis board</b><small className="label">{follow ? "following the practice position" : "your own line"}</small></div>
      <div style={{ display: "flex", gap: 6 }}>
        <EvalBar pct={winPct(top)} label={fmtEval(top)} flip={orientation === "black"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Board fen={fen} orientation={orientation} lastMove={last} arrows={arrows} showAnnotations={false}
            onMove={(from, to, promotion) => { try { const m = new Chess(fen).move({ from, to, promotion: promotion ?? "q" }); setFollow(false); setMoves([...moves, m.san]); return true; } catch { return false; } }} />
        </div>
      </div>
      {moves.length > 0 && <div className={c.moves}>{moves.map((m, i) => <button key={i} onClick={() => setMoves(moves.slice(0, i + 1))}>{m}</button>)}</div>}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button className="pill" onClick={() => setMoves(moves.slice(0, -1))} disabled={!moves.length}>← Undo</button>
        <button className="pill" data-active={follow} onClick={() => { setFollow(true); setBase(start); setMoves([]); }}>↺ Back to practice position</button>
      </div>
      <div style={{ display: "grid", gap: 3, fontSize: 12.5 }}>
        {cur ? cur.lines.slice(0, 3).map((l, i) => (
          <div key={i}><b style={{ display: "inline-block", minWidth: 44 }}>{fmtEval(l)}</b> {uciLineToSan(fen, l.pv, 8).join(" ")} <small className="label">d{l.depth}</small></div>
        )) : <small className="label">{pos.isGameOver() ? "Game over." : "Stockfish is thinking…"}</small>}
      </div>
    </div>
  );
}

export function OpeningTrainer({ ctx }: { ctx: BlockCtx }) {
  const { submit } = useApollo();
  const engine = useEngine();
  const drills = (ctx.data?.rows ?? []) as Row[];
  const [opId, setOpId] = usePersist("openings.op", OPENINGS[0].id);
  const op = OPENINGS.find((o) => o.id === opId) ?? OPENINGS[0];
  const tree = useMemo(() => buildTree(op), [op]);
  const [mode, setMode] = usePersist<"explore" | "drill">("openings.mode", "explore");
  const [showAn, setShowAn] = usePersist("openings.analysis", true);
  const [ideaTab, setIdeaTab] = usePersist<"attack" | "defence" | "strategy">("openings.ideas", "strategy");
  const mySide = op.side === "white" ? "w" : "b";

  // ---- explore ----
  const [paths, setPaths] = usePersist<Record<string, string[]>>("openings.paths", {});
  const path = useMemo(() => paths[op.id] ?? [], [paths, op.id]);
  const setPath = (p: string[]) => setPaths({ ...paths, [op.id]: p });
  const [fwd, setFwd] = useState<string[]>([]);
  const [eng, setEng] = useState<{ fen: string; best: string; eval: string } | null>(null);
  const pos = useMemo(() => { const g = new Chess(); for (const m of path) { try { g.move(m); } catch { break; } } return g; }, [path]);
  const node = walk(tree, path);
  const inBook = !!node;
  const bookDepth = (() => { let n: TNode | null = tree, d = 0; for (const m of path) { n = n?.kids.find((k) => k.san === m) ?? null; if (!n) break; d++; } return d; })();
  const kids = node?.kids ?? [];
  const theirTurn = pos.turn() !== mySide;
  // off book: ask Stockfish what's best here
  useEffect(() => {
    if (mode !== "explore" || inBook || !engine || pos.isGameOver()) return;
    const fen = pos.fen();
    let live = true;
    engine.analyse(fen, { depth: 16, multipv: 1 }).then((a) => { if (live && a.best) setEng({ fen, best: uciLineToSan(fen, [a.best])[0] ?? a.best, eval: fmtEval(a.lines[0]) }); }).catch(() => {});
    return () => { live = false; };
  }, [mode, inBook, engine, pos]);
  const go = (p: string[]) => { setPath(p); setFwd([]); };
  const play = (san: string) => { setPath([...path, san]); setFwd(fwd[0] === san ? fwd.slice(1) : []); };
  const back = () => { if (!path.length) return; setFwd([path[path.length - 1], ...fwd]); setPath(path.slice(0, -1)); };
  const forward = () => { if (fwd.length) { setPath([...path, fwd[0]]); setFwd(fwd.slice(1)); } else if (kids.length) setPath([...path, kids[0].san]); };
  const onExplore = (from: string, to: string, promotion?: string) => {
    try { const m = new Chess(pos.fen()).move({ from, to, promotion: promotion ?? "q" }); play(m.san); return true; } catch { return false; }
  };
  useEffect(() => {
    if (mode !== "explore") return;
    const k = (e: KeyboardEvent) => { if ((e.target as HTMLElement)?.closest?.("input,textarea,select")) return; if (e.key === "ArrowLeft") back(); if (e.key === "ArrowRight") forward(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const fen = pos.fen();
  const arrows: Arrow[] = kids.map((k, i) => ({ ...sq(fen, k.san)!, color: theirTurn ? (i === 0 ? "#5b8def" : "#5b8def99") : i === 0 ? "#3fb950" : "#3fb95099" })).filter((a) => a.from);
  if (!inBook && eng?.fen === fen) { const a = sq(fen, eng.best); if (a) arrows.push({ ...a, color: "#e3b341" }); }
  const lastEx = (() => { const h = pos.history({ verbose: true }); return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null; })();
  useScreenContext("opening explorer", mode === "explore" ? `${op.name}; moves: ${path.join(" ") || "(start)"}; ${inBook ? `book options here: ${kids.map((k) => k.san).join(", ") || "end of theory"}` : `out of book after ${bookDepth} moves`}` : null);

  // ---- drill ----
  const [line, setLine] = useState<string[]>(() => op.moves.split(" "));
  const [lineName, setLineName] = useState("Main line");
  const [ply, setPly] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [msg, setMsg] = useState<{ t: string; tone?: string } | null>(null);
  const [hint, setHint] = useState(false);
  const [running, setRunning] = useState(false);
  const dpos = useMemo(() => { const g = new Chess(); for (const m of line.slice(0, ply)) g.move(m); return g; }, [line, ply]);
  const done = ply >= line.length;
  const stats = (id: string) => {
    const ds = drills.filter((d) => d.opening === id);
    return ds.length ? `${ds.filter((d) => d.mistakes === 0).length}/${ds.length} clean` : "new";
  };
  /** Pick a branch: the opponent chooses among book replies, weighted toward less-drilled lines. */
  const startDrill = () => {
    const seen = drills.filter((d) => d.opening === op.id).map((d) => String(d.line ?? ""));
    const all = [{ line: op.moves, name: "Main line" }, ...(THEORY[op.id] ?? [])];
    const fresh = all.filter((l) => !seen.includes(l.name));
    const pick = (fresh.length ? fresh : all)[Math.floor(Math.random() * (fresh.length || all.length))];
    setLine(pick.line.split(" ")); setLineName(pick.name);
    setPly(0); setMistakes(0); setMsg(null); setHint(false); setRunning(true);
  };
  useEffect(() => {
    if (!running || done || dpos.turn() === mySide) return;
    const t = setTimeout(() => setPly((p) => p + 1), 380);
    return () => clearTimeout(t);
  }, [running, done, dpos, mySide]);
  useEffect(() => {
    if (running && done) {
      queueMicrotask(() => setMsg({ t: mistakes ? `${lineName} complete with ${mistakes} slip${mistakes > 1 ? "s" : ""}. Go again to make it clean.` : `Perfect: ${lineName} with no mistakes.`, tone: mistakes ? undefined : "good" }));
      void ctx.write("create", "opening_drills", { opening: op.id, name: op.name, side: op.side, mistakes, moves: line.length, line: lineName });
      queueMicrotask(() => setRunning(false));
    }
  }, [running, done]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDrill = (from: string, to: string, promotion?: string) => {
    if (!running || done || dpos.turn() !== mySide) return;
    let san = "";
    try { san = new Chess(dpos.fen()).move({ from, to, promotion: promotion ?? "q" }).san; } catch { return; }
    if (san === line[ply]) { setMsg({ t: `${san} ✓`, tone: "good" }); setHint(false); setPly(ply + 1); }
    else {
      // another book move from a different branch still counts as theory, just not this line's
      const alt = walk(tree, line.slice(0, ply))?.kids.some((k) => k.san === san);
      setMistakes((m) => m + 1);
      setMsg({ t: alt ? `${san} is also theory, but this drill is the ${lineName}: play ${line[ply]}.` : `${san} isn't the book move here. Try again${mistakes >= 1 ? ` (it's ${line[ply]})` : ""}.`, tone: "bad" });
    }
  };
  const expected = !done && running && dpos.turn() === mySide ? sq(dpos.fen(), line[ply]) : null;
  const lastDr = (() => { const h = dpos.history({ verbose: true }); return h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null; })();
  const opDrills = drills.filter((d) => d.opening === op.id);

  const moveNo = (i: number) => (i % 2 === 0 ? `${i / 2 + 1}.` : `${Math.floor(i / 2) + 1}…`);
  return (
    <div className={c.wrap}>
      <div className={c.boardCol}>
        {mode === "explore"
          ? <Board fen={fen} orientation={op.side} onMove={onExplore} lastMove={lastEx} arrows={arrows} interactive />
          : <Board fen={dpos.fen()} orientation={op.side} onMove={onDrill} lastMove={lastDr} hint={hint ? expected : null} interactive={running} />}
      </div>
      <div className={c.side}>
        <select className={c.sel} value={op.id} onChange={(e) => { setOpId(e.target.value); setFwd([]); setRunning(false); setMsg(null); }}>
          <optgroup label="As White">{OPENINGS.filter((o) => o.side === "white").map((o) => <option key={o.id} value={o.id}>{o.name} · {stats(o.id)}</option>)}</optgroup>
          <optgroup label="As Black">{OPENINGS.filter((o) => o.side === "black").map((o) => <option key={o.id} value={o.id}>{o.name} · {stats(o.id)}</option>)}</optgroup>
        </select>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="pill" data-active={mode === "explore"} onClick={() => setMode("explore")}>Explore lines</button>
          <button className="pill" data-active={mode === "drill"} onClick={() => setMode("drill")}>Drill</button>
          <small className="label" style={{ alignSelf: "center" }}>{(THEORY[op.id]?.length ?? 0) + 1} lines · {leaves(tree)} branches</small>
        </div>
        <div className={c.msg}><b>{op.name}</b> <span className="label">{op.eco} · you play {op.side}</span><br />{op.idea}</div>
        {IDEAS[op.id] && (
          <div className={c.msg}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              {(["attack", "defence", "strategy"] as const).map((k) => <button key={k} className="pill" data-active={ideaTab === k} onClick={() => setIdeaTab(k)}>{k === "attack" ? "⚔ Attacking ideas" : k === "defence" ? "🛡 Defensive ideas" : "♟ Strategy"}</button>)}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>{IDEAS[op.id][ideaTab].map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        <button className="pill" data-active={showAn} onClick={() => setShowAn(!showAn)} style={{ justifySelf: "start" }}>{showAn ? "Hide" : "Show"} analysis board</button>

        {mode === "explore" ? (
          <>
            <div className={c.moves}>
              <button onClick={() => go([])} data-on={path.length === 0}>Start</button>
              {path.map((m, i) => <button key={i} onClick={() => go(path.slice(0, i + 1))} data-on={i === path.length - 1} style={i >= bookDepth ? { opacity: 0.6, fontStyle: "italic" } : undefined}><em>{i % 2 === 0 || i === 0 ? moveNo(i) : ""}</em>{m}</button>)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="pill" onClick={back} disabled={!path.length}>← Back</button>
              <button className="pill" onClick={forward} disabled={!fwd.length && !kids.length}>Forward →</button>
              <button className="pill" onClick={() => go([])}>Reset</button>
            </div>
            {inBook ? (
              kids.length ? (
                <div className={c.msg}>
                  <span className="label">{theirTurn ? "Their options here, and your book answer to each" : "Your book move" + (kids.length > 1 ? "s" : "")}</span>
                  <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                    {kids.map((k) => (
                      <div key={k.san} style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <button className="pill" onClick={() => play(k.san)} title="Play this move" style={{ minWidth: 64 }}>{moveNo(path.length)} {k.san}</button>
                        {theirTurn && k.kids[0] && <span>→ <button className="pill" data-active="true" onClick={() => setPath([...path, k.san, k.kids[0].san])} title="Play both moves">{k.kids[0].san}</button>{k.kids.length > 1 && <small className="label"> (or {k.kids.slice(1).map((x) => x.san).join(", ")})</small>}</span>}
                        <small className="label" style={{ flex: "1 1 100%" }}>{k.names.slice(0, 3).join(" · ")}{k.names.length > 3 ? ` +${k.names.length - 3}` : ""} · {leaves(k)} line{leaves(k) > 1 ? "s" : ""}</small>
                      </div>
                    ))}
                  </div>
                  <small className="label" style={{ display: "block", marginTop: 6 }}>Arrows: {theirTurn ? "blue = their book replies" : "green = your book move"}. Or play any move on the board.</small>
                </div>
              ) : <div className={c.msg} data-tone="good">End of theory for this line: {node?.names.join(" · ")}. You know it from here; the plan is the opening&apos;s idea above.</div>
            ) : (
              <div className={c.msg} data-tone="bad">
                Out of book after {bookDepth} move{bookDepth === 1 ? "" : "s"} ({path[bookDepth]} isn&apos;t in the theory here).{" "}
                {eng?.fen === fen ? <>Stockfish: best is <b>{eng.best}</b> ({eng.eval}), shown in yellow.</> : "Asking Stockfish…"}
                <div style={{ marginTop: 6 }}><button className="pill" onClick={() => go(path.slice(0, bookDepth))}>Back to the last book position</button></div>
              </div>
            )}
            <button className="pill" onClick={() => submit(`In the ${op.name}, after ${path.join(" ") || "the start"}: ${inBook ? `the book options are ${kids.map((k) => k.san).join(", ") || "none (end of theory)"}` : `this is out of book (theory ended after ${path.slice(0, bookDepth).join(" ")})`}. Explain the ideas behind each option and which to play as ${op.side}, practical for a club player. Use walkthrough to show it on the board.`, { thread: "chess:openings" })}>Explain this position with Apollo</button>
          </>
        ) : (
          <>
            {msg && <div className={c.msg} data-tone={msg.tone}>{msg.t}</div>}
            {running && <small className="label">Line: {lineName}</small>}
            <div className={c.moves}>{line.slice(0, ply).map((m, i) => <button key={i}>{i % 2 === 0 && <em>{i / 2 + 1}.</em>}{m}</button>)}{!done && running && <button data-on="true">…</button>}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button className="pill" data-active="true" onClick={startDrill}>{running ? "New line" : "Start drill"}</button>
              {running && !done && <button className="pill" onClick={() => setHint(true)}>Hint</button>}
            </div>
            <small className="label">Each drill picks a different branch (ones you haven&apos;t drilled first). Drilled: {new Set(opDrills.map((d) => d.line).filter(Boolean)).size}/{(THEORY[op.id]?.length ?? 0) + 1} lines · {opDrills.filter((d) => d.mistakes === 0).length}/{opDrills.length} clean runs.</small>
          </>
        )}
      </div>
      {showAn && <div className={c.side}><SideAnalysis fen={mode === "explore" ? fen : dpos.fen()} orientation={op.side} /></div>}
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
  const [pz, setPz] = usePersist<Puzzle | null>("puzzle.pz", null);
  const [step, setStep] = usePersist("puzzle.step", 0);
  const [fen, setFen] = usePersist<string | null>("puzzle.fen", null);
  const [state, setState] = usePersist<"play" | "wrong" | "solved" | "shown" | "failed">("puzzle.state", "play");
  const [lives, setLives] = usePersist("puzzle.lives", 3);
  const [err, setErr] = useState<string | null>(null);
  const [rating, setRating] = useState(1500);
  const failed = useRef(false);
  useEffect(() => { try { const r = Number(localStorage.getItem(RKEY)); if (r) queueMicrotask(() => setRating(r)); } catch {} }, []);

  const next = async () => {
    setErr(null); setState("play"); setStep(0); failed.current = false; setLives(3);
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
  const onMove = (from: string, to: string, promotion?: string) => {
    if (!pz || !fen || state === "solved" || state === "shown" || state === "failed") return;
    const g = new Chess(fen);
    let mv;
    try { mv = g.move({ from, to, promotion: promotion ?? "q" }); } catch { return; }
    const want = pz.solution[step];
    const ok = mv.from + mv.to === want.slice(0, 4) || g.isCheckmate();
    if (!ok) {
      // three lives: only the third wrong move counts as a fail
      const left = lives - 1;
      setLives(left);
      if (left <= 0) { setState("failed"); if (!failed.current) { failed.current = true; record(false); } }
      else setState("wrong");
      return;
    }
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
        <div className="label">Your puzzle rating {rating}{pz?.rating ? ` · this puzzle ${pz.rating}` : ""}{pz && state !== "solved" && state !== "shown" ? ` · ${"♥".repeat(Math.max(0, lives))}${"♡".repeat(3 - Math.max(0, lives))}` : ""}</div>
        {err && <div className={c.msg} data-tone="bad">{err}</div>}
        {pz && <div className={c.msg} data-tone={state === "solved" ? "good" : state === "wrong" ? "bad" : undefined}>
          {state === "solved" ? "Solved ✓" : state === "wrong" ? `Not that one. ${lives} ${lives === 1 ? "life" : "lives"} left.` : state === "failed" ? "Out of lives: counted as a miss. Show the solution to see it." : state === "shown" ? `Solution: ${(() => { const g = new Chess(pz.fen); return pz.solution.map((u) => { try { return g.move(uciMove(u)).san; } catch { return u; } }).join(" "); })()}` : `Find the best move for ${toMove}.`}
          {pz.note && <><br /><small>{pz.note}</small></>}
          {pz.themes && (state === "solved" || state === "shown") && <><br /><small>Themes: {pz.themes.join(", ")}</small></>}
        </div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="pill" data-active="true" onClick={next}>Next puzzle</button>
          {pz && state !== "solved" && <button className="pill" onClick={() => { if (!failed.current) { failed.current = true; record(false); } setState("shown"); }}>Show solution</button>}
          {pz && <button className="pill" onClick={() => { setFen(pz.fen); setStep(0); setState("play"); setLives(3); }}>Retry</button>}
        </div>
      </div>
    </div>
  );
}


/* ======================= game review (chess.com style) ======================= */
type Init = { sans: string[]; startFen: string; me: "w" | "b"; gameId: string | null; title?: string };
type TryResult = { san: string; cls: Cls; loss: number; bestSan: string | null; line: string[]; fen: string; from: string; to: string };
type View = { kind: "game" } | { kind: "line"; fen: string; sans: string[]; k: number; label: string } | { kind: "retry"; ply: number; tries: number; msg: string | null; ok: boolean | null }
  | { kind: "try"; fen: string; label: string; back: { kind: "game" } | { kind: "line"; fen: string; sans: string[]; k: number; label: string }; busy: boolean; result: TryResult | null };
const PHASES: Phase[] = ["opening", "middlegame", "endgame"];
const phaseIcon = (a?: number) => (a == null ? { sym: "–", color: "var(--text-dim)" } : a >= 90 ? CLS.best : a >= 80 ? CLS.good : a >= 70 ? CLS.inaccuracy : a >= 55 ? CLS.mistake : CLS.blunder);
const DEPTHS = [{ d: 10, label: "Fast" }, { d: 13, label: "Standard" }, { d: 16, label: "Deep" }];

export function GameReview({ ctx, p, initial }: { ctx?: BlockCtx; p: P; initial?: Init }) {
  const engine = useEngine();
  const { submit } = useApollo();
  const games = (ctx?.data?.rows ?? []) as Row[];
  const [pgn, setPgn] = useState("");
  const [me, setMe] = useState<"w" | "b">(initial?.me ?? "w");
  const [prog, setProg] = useState<[number, number] | null>(null);
  // an embedded review (straight after a game) is kept per game, so a new game never shows an old review
  const rk = initial ? `.emb.${initial.gameId ?? `${initial.sans.length}.${initial.sans.slice(-3).join("")}`}` : "";
  const [rev, setRev] = usePersist<Review | null>(`review.rev${rk}`, null);
  const [idx, setIdx] = usePersist(`review.idx${rk}`, 0);
  const [game, setGame] = usePersist<Row | null>(`review.game${rk}`, null);
  const [view, setView] = useState<View>({ kind: "game" });
  const [tab, setTab] = useState<"report" | "moves">("report");
  const [depth, setDepth] = useState<number>(p.depth ?? 16);
  const [filter, setFilter] = useState<"all" | "practice" | "chess.com">("all");
  const started = useRef(false);

  const run = useCallback(async (sans: string[], side: "w" | "b", startFen: string | undefined, g: Row | null) => {
    if (!engine || !sans.length) return;
    setGame(g); setMe(side); setRev(null); setIdx(0); setTab("report"); setView({ kind: "game" });
    // already reviewed at this depth or deeper: reuse it
    if (g?.review?.plies?.length === sans.length && (g.review.depth ?? 0) >= depth && g.review.v === REVIEW_VERSION) { setRev(g.review as Review); return; }
    setProg([0, sans.length + 1]);
    const r = await reviewGame(sans, (fen) => engine.analyse(fen, { depth, multipv: 3 }), (d, t) => setProg([d, t]), startFen);
    setRev(r); setProg(null);
    if (g?.id) {
      void saveRecord("update", "chess_games", { review: { ...r, depth, me: side } }, g.id);
      ctx?.refresh?.();
    }
    for (const pz of puzzlesFromReview(r, side).slice(0, 10)) {
      const g2 = new Chess(pz.fen);
      let uci = "";
      try { const m = g2.move(pz.solution[0]); uci = m.from + m.to + (m.promotion ?? ""); } catch { continue; }
      void saveRecord("create", "chess_puzzles", { fen: pz.fen, solution: [uci], note: `From your game: you played ${pz.played} (${CLS[pz.cls].label.toLowerCase()}).`, source: g?.url ?? (g?.id ? `game:${g.id}` : "pasted") });
    }
  }, [engine, depth, ctx]);

  // opened straight from a finished game
  useEffect(() => {
    if (!initial || !engine || started.current || rev) return;
    started.current = true;
    queueMicrotask(() => { void run(initial.sans, initial.me, initial.startFen, initial.gameId ? { id: initial.gameId } : null); });
  }, [initial, engine, run, rev]);

  const openGame = (g: Row) => {
    const text = String(g.pgn ?? "");
    const sans = sansOf(text);
    if (!sans.length) return alert("That game has no moves saved.");
    void run(sans, g.color === "black" ? "b" : "w", fenOfPgn(text), g);
  };

  const ply = rev && idx > 0 ? rev.plies[idx - 1] : null;
  const gameFen = useMemo(() => (!rev ? new Chess().fen() : idx === 0 ? rev.startFen : rev.plies[idx - 1].fenAfter), [rev, idx]);
  const keyIdx = useMemo(() => (rev ? rev.plies.map((x, i) => (KEY_CLS.includes(x.cls) ? i + 1 : 0)).filter(Boolean) : []), [rev]);
  const myKeyIdx = useMemo(() => (rev ? rev.plies.map((x, i) => (x.color === me && BAD_CLS.includes(x.cls) && x.cls !== "inaccuracy" ? i + 1 : 0)).filter(Boolean) : []), [rev, me]);

  // board for the current view
  let boardFen = gameFen, lastMove: { from: string; to: string } | null = null, interactive = false;
  const marks: Record<string, Mark> = {}, squares: Record<string, string> = {}, arrows: Arrow[] = [];
  if (view.kind === "game" && ply) {
    const from = ply.uci.slice(0, 2), to = ply.uci.slice(2, 4);
    marks[to] = { label: CLS[ply.cls].sym, color: CLS[ply.cls].color };
    squares[from] = squares[to] = `${CLS[ply.cls].color}88`;
    if (ply.best && ply.best !== ply.uci && !["book", "brilliant", "great", "best"].includes(ply.cls)) arrows.push({ from: ply.best.slice(0, 2), to: ply.best.slice(2, 4), color: "green" });
  } else if (view.kind === "line") {
    const g = new Chess(view.fen);
    let lm: { from: string; to: string } | null = null;
    for (const s of view.sans.slice(0, view.k)) { try { const m = g.move(s); lm = { from: m.from, to: m.to }; } catch { break; } }
    boardFen = g.fen(); lastMove = lm;
    interactive = true; // spotted a better move in the line? play it to get it rated
  } else if (view.kind === "retry" && rev) {
    boardFen = rev.plies[view.ply - 1].fenBefore;
    interactive = view.ok !== true;
  } else if (view.kind === "try") {
    boardFen = view.result?.fen ?? view.fen;
    interactive = !view.busy && !view.result;
    if (view.result) {
      marks[view.result.to] = { label: CLS[view.result.cls].sym, color: CLS[view.result.cls].color };
      squares[view.result.from] = squares[view.result.to] = `${CLS[view.result.cls].color}88`;
    }
  }

  const evalNow = view.kind === "game" ? (ply ? ply.after : rev?.plies[0]?.before) : undefined;
  useScreenContext("game review", rev ? `Reviewing a game (you were ${me === "w" ? "White" : "Black"}). Accuracy W ${rev.accuracy.w} B ${rev.accuracy.b}. ${ply ? `Current move ${Math.ceil(idx / 2)}${ply.color === "w" ? "." : "..."} ${ply.san}: ${ply.cls}, coach says "${ply.coach}". Position before: ${ply.fenBefore}. Best: ${ply.bestSan ?? "?"} (${ply.bestLine.join(" ")}).` : "At the summary."}` : null);

  // keyboard: ← → through moves (or through a shown line)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (!rev || (e.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable]")) return;
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      if (view.kind === "line") setView({ ...view, k: Math.max(0, Math.min(view.sans.length, view.k + d)) });
      else { setView({ kind: "game" }); setIdx((i) => Math.max(0, Math.min(rev.plies.length, i + d))); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [rev, view]);

  const goto = (i: number) => { setView({ kind: "game" }); setIdx(i); if (i > 0) setTab("moves"); };
  const showLine = (fen: string, sans: string[], label: string) => { setView({ kind: "line", fen, sans, k: 1, label }); };
  // step through a shown line automatically
  useEffect(() => {
    if (view.kind !== "line" || view.k >= view.sans.length) return;
    const t = setTimeout(() => setView((v) => (v.kind === "line" ? { ...v, k: v.k + 1 } : v)), 900);
    return () => clearTimeout(t);
  }, [view]);

  const onRetry = (from: string, to: string, promotion?: string) => {
    if (view.kind !== "retry" || !rev) return;
    const pl = rev.plies[view.ply - 1];
    const g = new Chess(pl.fenBefore);
    let m;
    try { m = g.move({ from, to, promotion: promotion ?? "q" }); } catch { return; }
    const uci = m.from + m.to + (m.promotion ?? "");
    const ok = pl.alts.includes(uci) || uci === pl.best;
    void saveRecord("create", "puzzle_attempts", { source: "retry", puzzle_id: `${game?.id ?? "game"}:${view.ply}`, rating: null, solved: ok && view.tries === 0, themes: pl.cls });
    setView({ ...view, tries: view.tries + 1, ok, msg: ok ? `${m.san} is ${uci === pl.best ? "the best move" : "also a good move"}. ✓` : `${m.san} isn't it. Try again.` });
  };

  // your own move from any position (the move before, or a point in a shown line): rated like the others
  const onTry = async (base: string, back: Extract<View, { kind: "try" }>["back"], label: string, from: string, to: string, promotion?: string) => {
    if (!engine) return;
    const g = new Chess(base);
    let m;
    try { m = g.move({ from, to, promotion: promotion ?? "q" }); } catch { return; }
    setView({ kind: "try", fen: base, label, back, busy: true, result: null });
    const mover = new Chess(base).turn();
    const pov = (wp: number) => (mover === "w" ? wp : 100 - wp);
    const before = await engine.analyse(base, { depth: depth + 1, multipv: 1 });
    const after = g.isGameOver() ? { best: null, lines: [{ cp: g.isCheckmate() ? null : 0, mate: g.isCheckmate() ? (mover === "w" ? 0.5 : -0.5) : null, pv: [], depth: 0 }] } : await engine.analyse(g.fen(), { depth: depth + 1, multipv: 1 });
    const uci = m.from + m.to + (m.promotion ?? "");
    const loss = Math.max(0, Math.round((pov(winPct(before.lines[0])) - pov(winPct(after.lines[0]))) * 10) / 10);
    const cls = classifyLoss(loss, before.best === uci);
    setView({ kind: "try", fen: base, label, back, busy: false, result: { san: m.san, cls, loss, bestSan: before.best ? uciLineToSan(base, [before.best], 1)[0] ?? null : null, line: uciLineToSan(g.fen(), after.lines[0]?.pv ?? []), fen: g.fen(), from: m.from, to: m.to } });
  };
  const onBoardMove = (from: string, to: string, promotion?: string) => {
    if (view.kind === "retry") return onRetry(from, to, promotion);
    if (view.kind === "line") { const g = new Chess(view.fen); for (const x of view.sans.slice(0, view.k)) { try { g.move(x); } catch { break; } } void onTry(g.fen(), view, `Your idea in the line`, from, to, promotion); }
    if (view.kind === "try" && !view.result) void onTry(view.fen, view.back, view.label, from, to, promotion);
  };
  const timeClass = String(game?.time_class ?? (initial ? "practice" : "")) || null;
  const tcNote = timeClass ? ` This was a ${timeClass} game${TC_EXPECT[timeClass] ? ` (around ${TC_EXPECT[timeClass]}% accuracy is strong at that speed)` : ""}: judge decisions with that clock in mind.` : "";

  const askWhy = () => {
    if (!rev || !ply) return;
    const n = Math.ceil(idx / 2);
    submit(`Explain move ${n}${ply.color === "w" ? "." : "..."} ${ply.san} in my game (I was ${me === "w" ? "White" : "Black"}). Stockfish classified it as ${CLS[ply.cls].label} (win-chance loss ${ply.loss}%). Eval before ${fmtEval(ply.before)}, after ${fmtEval(ply.after)}. Position before the move (FEN): ${ply.fenBefore}. Best was ${ply.bestSan ?? "?"} with ${ply.bestLine.join(" ")}. After ${ply.san}, the opponent's best reply line: ${ply.replyLine.join(" ") || "none"}. Explain WHY it's ${CLS[ply.cls].label.toLowerCase()} and why the best move is better, in plain words for a club player: threats, tactics, plans.${tcNote} Use annotate_board on the position after my move (FEN ${ply.fenAfter}) to draw arrows for the threats and the better move. Don't change the classification.`, { thread: "chess:review" });
  };

  const graph = rev ? [rev.plies[0] ? winPct(rev.plies[0].before) : 50, ...rev.plies.map((x) => winPct(x.after))] : [];
  const W = Math.max(1, graph.length - 1);

  /* ---------- game picker ---------- */
  if (!rev && !prog)
    return (
      <div className={c.pickWrap}>
        <div className={c.toolbar}>
          <span className="label">Your games</span>
          {(["all", "practice", "chess.com"] as const).map((f) => <button key={f} className="pill" data-active={filter === f} onClick={() => setFilter(f)}>{f}</button>)}
          <select className={c.sel} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="Analysis depth">{DEPTHS.map((d) => <option key={d.d} value={d.d}>{d.label} (depth {d.d})</option>)}</select>
          <StylePicker />
        </div>
        <div className={c.gameList}>
          {games.filter((g) => filter === "all" || (filter === "practice" ? !g.url : !!g.url)).map((g) => (
            <button key={g.id} className={c.gameRow} onClick={() => openGame(g)} disabled={!engine}>
              <i className={c.res} data-r={g.result}>{g.result === "win" ? "W" : g.result === "loss" ? "L" : "½"}</i>
              <span><b>{g.opponent ?? "?"}</b>{g.opponent_rating ? ` (${g.opponent_rating})` : ""}<small>{g.url ? "chess.com" : "practice"} · {g.time_class ?? ""} · {g.color} · {new Date(g.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></span>
              {g.review?.accuracy ? <em className={c.accBadge}>{g.review.accuracy[g.color === "black" ? "b" : "w"]}</em> : <em className={c.accBadge} data-none="true">Review</em>}
            </button>
          ))}
          {!games.length && <span className="label">No games yet. Play Stockfish on Play &amp; analyse (finished games land here), sync chess.com, or paste a PGN.</span>}
        </div>
        <textarea className={c.input} rows={4} placeholder="…or paste a PGN" value={pgn} onChange={(e) => setPgn(e.target.value)} />
        <div className={c.toolbar}>
          <select className={c.sel} value={me} onChange={(e) => setMe(e.target.value as "w" | "b")}><option value="w">I was White</option><option value="b">I was Black</option></select>
          <button className={c.reviewBtnSm} disabled={!engine || !pgn.trim()} onClick={() => { const sans = sansOf(pgn); if (!sans.length) return alert("Couldn't read that PGN."); void run(sans, me, fenOfPgn(pgn), null); }}>★ Review pasted game</button>
        </div>
      </div>
    );

  if (prog)
    return (
      <div className={c.progress}>
        <div className={c.coach}><i className={c.coachOrb} /><p>Analysing your game with Stockfish… {prog[0]}/{prog[1]} positions</p></div>
        <div className={c.bar}><i style={{ width: `${(prog[0] / prog[1]) * 100}%` }} /></div>
      </div>
    );

  if (!rev) return null;
  const myAcc = rev.accuracy[me];
  return (
    <div className={c.wrap}>
      <div className={c.boardCol}>
        <EvalBar pct={winPct(view.kind === "game" ? evalNow : undefined)} label={view.kind === "game" ? fmtEval(evalNow) : "…"} flip={me === "b"} />
        <div className={c.boardStack}>
          <Board fen={boardFen} orientation={me === "w" ? "white" : "black"} interactive={interactive} onMove={onBoardMove}
            marks={marks} squares={squares} arrows={arrows} lastMove={lastMove} />
        </div>
      </div>
      <div className={c.side} data-review="true">
        <div className={c.reviewHead}>
          <b>★ Game Review</b>
          <div className={c.tabs}>
            <button data-on={tab === "report"} onClick={() => { setTab("report"); goto(0); }}>Report</button>
            <button data-on={tab === "moves"} onClick={() => setTab("moves")}>Moves</button>
          </div>
          <StylePicker />
        </div>

        {/* coach bubble */}
        <div className={c.coach}>
          <i className={c.coachOrb} />
          <div>
            {view.kind === "try" ? (
                <p>{view.busy ? "Checking your move with Stockfish…" : view.result ? (
                  <>
                    <i className={c.cls} style={{ background: CLS[view.result.cls].color }}>{CLS[view.result.cls].sym}</i>{" "}
                    Your move <b>{view.result.san}</b> is {/^[aeiou]/i.test(CLS[view.result.cls].label) ? "an" : "a"} <b style={{ color: CLS[view.result.cls].color }}>{CLS[view.result.cls].label.toLowerCase()}</b> move{view.result.loss >= 1 ? ` (−${view.result.loss}% win chance)` : ""}.
                    {view.result.bestSan && view.result.bestSan !== view.result.san ? <> Best here was <b>{view.result.bestSan}</b>.</> : null}
                    {view.result.line.length > 0 && <><br /><small>Engine line after your move: {view.result.line.join(" ")}</small></>}
                  </>
                ) : <>{view.label}: drag a piece to play the move you have in mind. It gets rated like every other move.</>}</p>
              )
              : view.kind === "line" ? <p><b>{view.label}</b> {view.sans.slice(0, view.k).join(" ")}<br /><small className="label">Spotted something else? Play it on the board to rate it.</small></p>
              : view.kind === "retry" ? <p>{view.msg ?? `Find a better move than ${rev.plies[view.ply - 1].san}.`}</p>
              : ply ? (
                <p>
                  <i className={c.cls} style={{ background: CLS[ply.cls].color }}>{CLS[ply.cls].sym}</i>{" "}
                  <b>{ply.san}</b> is {/^[aeiou]/i.test(CLS[ply.cls].label) ? "an" : "a"} <b style={{ color: CLS[ply.cls].color }}>{CLS[ply.cls].label.toLowerCase()}</b> move <span className={c.evalChip}>{fmtEval(ply.after)}</span>
                  <br />{ply.coach}
                </p>
              ) : (
                <p>{rev.opening ? `${rev.opening}. ` : ""}{myAcc >= 90 ? "Excellent game, very accurate." : myAcc >= 80 ? "A solid game with a few slips." : myAcc >= 65 ? "Some good ideas, and some moments to learn from." : "A tough one. Let's find the key moments."} Your accuracy was <b>{myAcc}</b>{timeClass && TC_EXPECT[timeClass] ? <> ({myAcc >= TC_EXPECT[timeClass] ? "strong" : myAcc >= TC_EXPECT[timeClass] - 8 ? "about normal" : "below par"} for {timeClass}, where ~{TC_EXPECT[timeClass]}% is strong)</> : null}.</p>
              )}
          </div>
        </div>

        {/* action buttons (fixed row) */}
        <div className={c.actions}>
          {view.kind !== "game" ? (
            <>
              {view.kind === "line" && <button className="pill" onClick={() => setView({ ...view, k: Math.max(0, view.k - 1) })}>◀</button>}
              {view.kind === "line" && <button className="pill" onClick={() => setView({ ...view, k: Math.min(view.sans.length, view.k + 1) })}>▶</button>}
              {view.kind === "retry" && !view.ok && view.tries > 0 && <button className="pill" onClick={() => { const pl = rev.plies[view.ply - 1]; showLine(pl.fenBefore, pl.bestLine, "Best line:"); }}>Show the answer</button>}
              {view.kind === "try" && view.result && view.result.line.length > 0 && <button className="pill" onClick={() => showLine(view.result!.fen, view.result!.line, `After your ${view.result!.san}:`)}>Show what happens next</button>}
              {view.kind === "try" && view.result && <button className="pill" onClick={() => setView({ ...view, result: null })}>Try another move</button>}
              {view.kind === "try" && view.back.kind === "line" && <button className="pill" onClick={() => setView(view.back)}>Back to the line</button>}
              <button className="pill" data-active="true" onClick={() => setView({ kind: "game" })}>Back to game</button>
            </>
          ) : ply ? (
            <>
              {ply.bestSan && ply.bestSan !== ply.san && <button className="pill" onClick={() => showLine(ply.fenBefore, ply.bestLine, "Best:")}>Best</button>}
              {ply.replyLine.length > 0 && <button className="pill" onClick={() => showLine(ply.fenAfter, ply.replyLine, "Follow-up:")}>Show follow-up</button>}
              {ply.color === me && BAD_CLS.includes(ply.cls) && <button className="pill" onClick={() => setView({ kind: "retry", ply: idx, tries: 0, msg: null, ok: null })}>↻ Retry</button>}
              <button className="pill" onClick={() => setView({ kind: "try", fen: ply.fenBefore, label: `Instead of ${ply.san}`, back: { kind: "game" }, busy: false, result: null })}>✎ Try your own move</button>
              <button className="pill" onClick={askWhy}>Ask Apollo why</button>
              {keyIdx.some((i) => i > idx) && <button className="pill" onClick={() => goto(keyIdx.find((i) => i > idx)!)}>Next key moment ›</button>}
            </>
          ) : (
            <>
              <button className={c.reviewBtnSm} onClick={() => goto(1)}>Start review</button>
              {myKeyIdx.length > 0 && <button className="pill" onClick={() => setView({ kind: "retry", ply: myKeyIdx[0], tries: 0, msg: null, ok: null })}>Retry my mistakes ({myKeyIdx.length})</button>}
            </>
          )}
        </div>

        {/* eval graph */}
        <div className={c.graphWrap}>
          <svg className={c.graph} viewBox={`0 0 ${W} 100`} preserveAspectRatio="none"
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); goto(Math.round(((e.clientX - r.left) / r.width) * W)); }}>
            <rect x="0" y="0" width={W} height="100" fill="#3a3a3a" />
            <path d={`M0,100 ${graph.map((v, i) => `L${i},${100 - v}`).join(" ")} L${W},100 Z`} fill="#f2f2f2" />
            <line x1="0" x2={W} y1="50" y2="50" stroke="#888" strokeWidth="1" vectorEffect="non-scaling-stroke" strokeDasharray="3 3" />
            <line x1={idx} x2={idx} y1="0" y2="100" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          {rev.plies.map((x, i) => KEY_CLS.includes(x.cls) && (
            <button key={i} className={c.graphDot} style={{ left: `${((i + 1) / W) * 100}%`, top: `${100 - graph[i + 1]}%`, background: CLS[x.cls].color }} onClick={() => goto(i + 1)} title={`${x.san}: ${CLS[x.cls].label}`} />
          ))}
        </div>

        {tab === "report" ? (
          <div className={c.report}>
            {/* laid out like chess.com: players, accuracy, the classification table, then game rating */}
            <div className={c.ccTable}>
              <div className={c.ccLine}>
                <span className={c.ccLabel}>Players</span>
                {(["w", "b"] as const).map((side, k) => (
                  <span key={side} className={c.ccPlayer} data-me={side === me} style={{ gridColumn: k ? 4 : 2 }}>
                    <i data-side={side}>{side === me ? "You" : (game?.opponent ?? "?").slice(0, 2).toUpperCase()}</i>
                    <small>{side === me ? "You" : game?.opponent ?? (side === "w" ? "White" : "Black")}{side !== me && game?.opponent_rating ? ` (${game.opponent_rating})` : ""}</small>
                  </span>
                ))}
              </div>
              <div className={c.ccLine}>
                <span className={c.ccLabel}>Accuracy</span>
                {(["w", "b"] as const).map((side, k) => <b key={side} className={c.accBig} data-side={side} style={{ gridColumn: k ? 4 : 2, fontSize: 17, minWidth: 0 }}>{rev.accuracy[side].toFixed(1)}</b>)}
              </div>
              <span className={c.ccSep} />
              {CLS_ORDER.map((k) => (
                <button key={k} className={c.ccRow} onClick={() => { const i = rev.plies.findIndex((x) => x.cls === k && x.color === me); if (i >= 0) goto(i + 1); }} title={`Jump to your first ${CLS[k].label.toLowerCase()}`}>
                  <span className={c.ccLabel}>{CLS[k].label}</span>
                  <b style={{ color: CLS[k].color }}>{rev.counts.w[k] ?? 0}</b>
                  <i className={c.cls} style={{ background: CLS[k].color }}>{CLS[k].sym}</i>
                  <b style={{ color: CLS[k].color }}>{rev.counts.b[k] ?? 0}</b>
                </button>
              ))}
              <span className={c.ccSep} />
              <div className={c.ccLine}>
                <span className={c.ccLabel}>Game Rating</span>
                {(["w", "b"] as const).map((side, k) => <b key={side} className={c.ccRating} style={{ gridColumn: k ? 4 : 2 }}>{rev.rating[side]}</b>)}
              </div>
            </div>
            <div className={c.phases}>
              {PHASES.map((ph) => (
                <div key={ph}>
                  <i className={c.cls} style={{ background: phaseIcon(rev.phases.w[ph]).color }}>{phaseIcon(rev.phases.w[ph]).sym}</i>
                  <span>{ph[0].toUpperCase() + ph.slice(1)}</span>
                  <i className={c.cls} style={{ background: phaseIcon(rev.phases.b[ph]).color }}>{phaseIcon(rev.phases.b[ph]).sym}</i>
                </div>
              ))}
            </div>
            <small className="label">Accuracy uses the same method as Lichess (close to chess.com&apos;s); game rating is estimated from accuracy, since chess.com&apos;s exact formulas aren&apos;t public. Classifications are computed from Stockfish ({rev.plies[0]?.before?.depth ? `depth ${rev.plies[0].before.depth}` : "engine"}).</small>
          </div>
        ) : (
          <div className={c.moveTable}>
            {Array.from({ length: Math.ceil((rev.plies.length + (rev.plies[0]?.color === "b" ? 1 : 0)) / 2) }, (_, r) => {
              const off = rev.plies[0]?.color === "b" ? 1 : 0;
              const cell = (i: number) => {
                const x = rev.plies[i];
                if (!x || i < 0) return <span />;
                return (
                  <button data-on={i + 1 === idx && view.kind === "game"} onClick={() => goto(i + 1)}>
                    {!["excellent", "good"].includes(x.cls) ? <i className={c.cls} data-small="true" style={{ background: CLS[x.cls].color }}>{CLS[x.cls].sym}</i> : <i className={c.clsGap} />}
                    {x.san}
                  </button>
                );
              };
              const moveNo = Number(rev.startFen.split(" ")[5] || 1) + r;
              return (
                <div key={r} className={c.moveRow}>
                  <em>{moveNo}.</em>
                  {cell(r * 2 - off)}
                  {cell(r * 2 + 1 - off)}
                </div>
              );
            })}
          </div>
        )}

        <div className={c.nav}>
          <button onClick={() => goto(0)} aria-label="Start">⏮</button>
          <button onClick={() => goto(Math.max(0, idx - 1))} aria-label="Previous">◀</button>
          <button onClick={() => goto(Math.min(rev.plies.length, idx + 1))} aria-label="Next">▶</button>
          <button onClick={() => goto(rev.plies.length)} aria-label="End">⏭</button>
        </div>
        <div className={c.toolbar}>
          <button className="pill" onClick={() => {
            const bad = rev.plies.map((x, i) => ({ ...x, n: Math.floor(i / 2) + 1 })).filter((x) => x.color === me && BAD_CLS.includes(x.cls));
            submit(`Coach me on this whole chess game (I was ${me === "w" ? "White" : "Black"}${game?.opponent ? ` vs ${game.opponent}` : ""}). Accuracy W ${rev.accuracy.w} / B ${rev.accuracy.b}. ${rev.opening ? `Opening: ${rev.opening}. ` : ""}Moves: ${rev.plies.map((x) => x.san).join(" ")}. My flagged moves (Stockfish): ${bad.map((x) => `${x.n}. ${x.san} = ${x.cls}, best ${x.bestSan} (${x.bestLine.join(" ")})`).join("; ") || "none"}. Give the 3 key moments, the recurring weakness, and one thing to practise.${tcNote} Use walkthrough to show each key moment on the board as you explain it (FEN before each move: ${bad.slice(0, 6).map((x) => `${x.n}${x.color === "w" ? "." : "..."}${x.san}: ${x.fenBefore}`).join(" | ")}). Don't change the classifications.`, { thread: "chess:review" });
          }}>Coach me on this game</button>
          {!initial && <button className="pill" onClick={() => { setRev(null); setGame(null); }}>Another game</button>}
        </div>
      </div>
    </div>
  );
}
