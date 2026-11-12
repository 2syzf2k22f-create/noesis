"use client";
// Brain tests in the Human Benchmark layout: a blue panel for the test, then your statistics
// and an "about" section. Scores save to brain_test_results; all stats are computed in code.

import { useCallback, useEffect, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import type { BlockCtx } from "./Blocks";
import { Bars } from "./Blocks";
import b from "./bench.module.css";

type TestId = "reaction" | "sequence" | "aim" | "numbers" | "verbal" | "chimp" | "visual" | "typing";
type Meta = { id: TestId; name: string; icon: string; blurb: string; unit: string; better: "higher" | "lower"; about: string };
const TESTS: Meta[] = [
  { id: "reaction", name: "Reaction Time", icon: "⚡", blurb: "Test your visual reflexes.", unit: "ms", better: "lower", about: "Measures how fast you react to a visual stimulus. The score is the average of 5 attempts. Typical: 200–300 ms. Fatigue, caffeine and screen latency all show up here." },
  { id: "sequence", name: "Sequence Memory", icon: "▦", blurb: "Remember an increasingly long pattern of button presses.", unit: "level", better: "higher", about: "Memorise the order the squares flash in, then repeat it. Each level adds one more step. Tests short-term visual-spatial memory." },
  { id: "aim", name: "Aim Trainer", icon: "◎", blurb: "How quickly can you hit all the targets?", unit: "ms", better: "lower", about: "Hit 30 targets as fast as you can. The score is the average time per target. Measures mouse or touch speed and accuracy." },
  { id: "numbers", name: "Number Memory", icon: "123", blurb: "Remember the longest number you can.", unit: "digits", better: "higher", about: "The average person can remember 7 digits at once. You see the number while the bar runs down, then type it. One more digit each level." },
  { id: "verbal", name: "Verbal Memory", icon: "Aa", blurb: "Keep as many words in short term memory as possible.", unit: "words", better: "higher", about: "Words appear one at a time: say whether you've seen each one this session. You have 3 lives. Tests recognition memory." },
  { id: "chimp", name: "Chimp Test", icon: "🐒", blurb: "Are you smarter than a chimpanzee?", unit: "numbers", better: "higher", about: "Click the squares in order of their numbers; after the first click they hide. Each round adds one more number. Three strikes and you're out." },
  { id: "visual", name: "Visual Memory", icon: "◫", blurb: "Remember an increasingly large board of squares.", unit: "level", better: "higher", about: "Some tiles light up briefly: click all of them. Three wrong tiles in a level costs a life; you have 3 lives. The grid grows as you level up." },
  { id: "typing", name: "Typing", icon: "⌨", blurb: "How many words per minute can you type?", unit: "wpm", better: "higher", about: "Type the passage as fast and accurately as you can. WPM counts correct characters ÷ 5 per minute." },
];
const rnd = (n: number) => Math.floor(Math.random() * n);
const shuffle = <T,>(a: T[]) => { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = rnd(i + 1); [c[i], c[j]] = [c[j], c[i]]; } return c; };
const now = () => performance.now();

type Save = (score: number) => void;

/* ---------- shared result screen ---------- */
function Result({ m, score, sub, onAgain }: { m: Meta; score: string; sub?: string; onAgain: () => void }) {
  return (
    <div className={b.center}>
      <div className={b.icon}>{m.icon}</div>
      <div className={b.label}>{m.name}</div>
      <div className={b.big}>{score}</div>
      {sub && <p>{sub}</p>}
      <div className={b.btns}><span className={b.saved}>Score saved ✓</span><button className={b.btn} onClick={onAgain}>Try again</button></div>
    </div>
  );
}
function Intro({ m, line, onStart, clickAnywhere }: { m: Meta; line: string; onStart: () => void; clickAnywhere?: boolean }) {
  return (
    <div className={b.center} onClick={clickAnywhere ? onStart : undefined}>
      <div className={b.icon}>{m.icon}</div>
      <h2 className={b.title}>{m.name}{m.id === "reaction" ? " Test" : ""}</h2>
      <p>{line}</p>
      {clickAnywhere ? <p className={b.hint}>Click anywhere to start.</p> : <button className={b.btn} onClick={onStart}>Start</button>}
    </div>
  );
}

/* ---------- reaction time ---------- */
function Reaction({ m, save }: { m: Meta; save: Save }) {
  const [st, setSt] = useState<"intro" | "wait" | "go" | "shown" | "early" | "done">("intro");
  const [times, setTimes] = useState<number[]>([]);
  const t0 = useRef(0), timer = useRef<number | null>(null);
  const begin = () => { setSt("wait"); timer.current = window.setTimeout(() => { t0.current = now(); setSt("go"); }, 1500 + Math.random() * 3000); };
  const click = () => {
    if (st === "intro" || st === "shown" || st === "early") return begin();
    if (st === "wait") { if (timer.current) clearTimeout(timer.current); return setSt("early"); }
    if (st === "go") {
      const t = Math.round(now() - t0.current), next = [...times, t];
      setTimes(next);
      if (next.length >= 5) { const avg = Math.round(next.reduce((a, c) => a + c, 0) / next.length); save(avg); setSt("done"); } else setSt("shown");
    }
  };
  if (st === "done") return <div className={b.hero}><Result m={m} score={`${Math.round(times.reduce((a, c) => a + c, 0) / times.length)} ms`} sub={times.map((t) => `${t}`).join(" · ")} onAgain={() => { setTimes([]); setSt("intro"); }} /></div>;
  const bg = st === "wait" ? b.red : st === "go" ? b.green : "";
  return (
    <div className={`${b.hero} ${bg} ${b.clickable}`} onMouseDown={click}>
      {st === "intro" && <Intro m={m} line="When the red box turns green, click as quickly as you can." onStart={() => {}} clickAnywhere />}
      {st === "wait" && <div className={b.center}><div className={b.icon}>···</div><div className={b.big}>Wait for green</div></div>}
      {st === "go" && <div className={b.center}><div className={b.icon}>···</div><div className={b.big}>Click!</div></div>}
      {st === "shown" && <div className={b.center}><div className={b.icon}>🕓</div><div className={b.big}>{times[times.length - 1]} ms</div><p>Click to keep going · {times.length} of 5</p></div>}
      {st === "early" && <div className={b.center}><div className={b.icon}>!</div><div className={b.big}>Too soon!</div><p>Click to try again.</p></div>}
    </div>
  );
}

/* ---------- sequence memory ---------- */
function Sequence({ m, save }: { m: Meta; save: Save }) {
  const [phase, setPhase] = useState<"intro" | "show" | "input" | "done">("intro");
  const [seq, setSeq] = useState<number[]>([]);
  const [pos, setPos] = useState(0);
  const [lit, setLit] = useState<number | null>(null);
  const play = (s: number[]) => {
    setPhase("show"); setPos(0);
    s.forEach((c, i) => { setTimeout(() => setLit(c), 600 + i * 600); setTimeout(() => setLit(null), 600 + i * 600 + 400); });
    setTimeout(() => setPhase("input"), 700 + s.length * 600);
  };
  const press = (c: number) => {
    if (phase !== "input") return;
    setLit(c); setTimeout(() => setLit(null), 150);
    if (seq[pos] !== c) { save(seq.length - 1); return setPhase("done"); }
    if (pos + 1 === seq.length) { const n = [...seq, rnd(9)]; setSeq(n); setTimeout(() => play(n), 500); } else setPos(pos + 1);
  };
  if (phase === "intro") return <div className={b.hero}><Intro m={m} line="Memorize the pattern." onStart={() => { const s = [rnd(9)]; setSeq(s); play(s); }} /></div>;
  if (phase === "done") return <div className={b.hero}><Result m={m} score={`Level ${seq.length - 1}`} onAgain={() => setPhase("intro")} /></div>;
  return (
    <div className={b.hero}>
      <div className={b.levelBar}>Level: {seq.length}</div>
      <div className={b.seq}>{Array.from({ length: 9 }, (_, i) => <button key={i} data-lit={lit === i} onMouseDown={() => press(i)} aria-label={`Square ${i + 1}`} />)}</div>
    </div>
  );
}

/* ---------- aim trainer ---------- */
function Aim({ m, save }: { m: Meta; save: Save }) {
  const [left, setLeft] = useState(30);
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [at, setAt] = useState({ x: 50, y: 50 });
  const [avg, setAvg] = useState(0);
  const t0 = useRef(0), last = useRef(0);
  const hit = () => {
    const t = now();
    if (left === 30) { t0.current = t; } // the first click starts the clock
    last.current = t;
    const nl = left - 1;
    setLeft(nl);
    setAt({ x: 8 + Math.random() * 84, y: 12 + Math.random() * 76 });
    if (nl === 0) { const a = Math.round((t - t0.current) / 29); setAvg(a); save(a); setPhase("done"); }
  };
  if (phase === "intro") return <div className={b.hero}><div className={b.center}><div className={b.icon}>◎</div><h2 className={b.title}>Aim Trainer</h2><p>Hit 30 targets as quickly as you can.</p><p className={b.hint}>Click the target below to start.</p><button className={b.target} style={{ position: "static" }} onMouseDown={() => { setPhase("play"); hit(); }} aria-label="Start target" /></div></div>;
  if (phase === "done") return <div className={b.hero}><Result m={m} score={`${avg} ms`} sub="average time per target" onAgain={() => { setLeft(30); setPhase("intro"); }} /></div>;
  return (
    <div className={b.hero}>
      <div className={b.levelBar}>Remaining {left}</div>
      <button className={b.target} style={{ left: `${at.x}%`, top: `${at.y}%` }} onMouseDown={hit} aria-label="Target" />
    </div>
  );
}

/* ---------- number memory ---------- */
function NumberMemory({ m, save }: { m: Meta; save: Save }) {
  const [level, setLevel] = useState(1);
  const [num, setNum] = useState("");
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<"intro" | "show" | "input" | "check" | "done">("intro");
  const [ms, setMs] = useState(0);
  const start = (lv: number) => {
    const s = Array.from({ length: lv }, () => String(rnd(10))).join("");
    // display time grows with length: 1 s + 1 s per digit (level 7 = 8 s)
    const t = 1000 + lv * 1000;
    setNum(s); setAnswer(""); setMs(t); setLevel(lv); setPhase("show");
    setTimeout(() => setPhase("input"), t);
  };
  if (phase === "intro") return <div className={b.hero}><Intro m={m} line="The average person can remember 7 numbers at once. Can you do more?" onStart={() => start(1)} /></div>;
  if (phase === "show")
    return (
      <div className={b.hero}>
        <div className={b.center}>
          <div className={b.number}>{num}</div>
          <div className={b.timer}><i style={{ animationDuration: `${ms}ms` }} /></div>
        </div>
      </div>
    );
  if (phase === "input")
    return (
      <div className={b.hero}>
        <form className={b.center} onSubmit={(e) => { e.preventDefault(); setPhase("check"); }}>
          <h3 className={b.q}>What was the number?</h3>
          <p className={b.hint}>Press enter to submit</p>
          <input className={b.input} autoFocus inputMode="numeric" value={answer} onChange={(e) => setAnswer(e.target.value.replace(/\D/g, ""))} />
          <button className={b.btn}>Submit</button>
        </form>
      </div>
    );
  const ok = answer === num;
  if (phase === "done") return <div className={b.hero}><Result m={m} score={`${level - 1} digits`} onAgain={() => setPhase("intro")} /></div>;
  return (
    <div className={b.hero}>
      <div className={b.center}>
        <div className={b.label}>Number</div><div className={b.mid}>{num}</div>
        <div className={b.label}>Your answer</div>
        <div className={b.mid}>{[...answer].map((ch, i) => <span key={i} className={ch === num[i] ? "" : b.wrong}>{ch}</span>)}{answer.length < num.length && <span className={b.wrong}>{"_".repeat(num.length - answer.length)}</span>}</div>
        <div className={b.big}>Level {level}</div>
        <button className={b.btn} onClick={() => { if (ok) start(level + 1); else { save(level - 1); setPhase("done"); } }}>{ok ? "Next" : "See score"}</button>
      </div>
    </div>
  );
}

/* ---------- verbal memory ---------- */
const WORDS = "orbit lantern meadow crystal harbour velvet canyon ember quartz willow thunder saffron glacier pepper marble falcon nectar prism tundra cobalt ripple summit violet anchor lotus cipher amber delta mosaic beacon cactus dagger echo fable garnet hollow iris jasper kettle lagoon magnet nimbus oasis parcel quiver raven sable tango umbra vessel walnut yonder zephyr bramble cinder dune fern grove heron ivory jungle kayak lilac mango nova olive pebble quill reef sprout thistle urchin vapor wren yarrow alloy bison comet drift ferry gravel hatch inlet jade knoll ledge mirth notch onyx pylon quarry rumble shard trellis vortex".split(" ");
function Verbal({ m, save }: { m: Meta; save: Save }) {
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [seen, setSeen] = useState<string[]>([]);
  const [word, setWord] = useState("");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const pick = (s: string[]) => (s.length > 2 && Math.random() < 0.4 ? s[rnd(s.length)] : (shuffle(WORDS.filter((w) => !s.includes(w)))[0] ?? s[rnd(s.length)]));
  const answer = (saidSeen: boolean) => {
    const correct = saidSeen === seen.includes(word);
    const s = seen.includes(word) ? seen : [...seen, word];
    setSeen(s);
    if (correct) { setScore(score + 1); setWord(pick(s)); }
    else if (lives <= 1) { setLives(0); save(score); setPhase("done"); }
    else { setLives(lives - 1); setWord(pick(s)); }
  };
  if (phase === "intro") return <div className={b.hero}><Intro m={m} line="You will be shown words, one at a time. If you've seen a word during the test, click SEEN. If it's a new word, click NEW." onStart={() => { setSeen([]); setScore(0); setLives(3); setWord(pick([])); setPhase("play"); }} /></div>;
  if (phase === "done") return <div className={b.hero}><Result m={m} score={`${score} words`} onAgain={() => setPhase("intro")} /></div>;
  return (
    <div className={b.hero}>
      <div className={b.center}>
        <div className={b.stats}><span>Lives | <b>{lives}</b></span><span>Score | <b>{score}</b></span></div>
        <div className={b.word}>{word}</div>
        <div className={b.btns}><button className={b.btn} onClick={() => answer(true)}>SEEN</button><button className={b.btn} onClick={() => answer(false)}>NEW</button></div>
      </div>
    </div>
  );
}

/* ---------- chimp test ---------- */
function Chimp({ m, save }: { m: Meta; save: Save }) {
  const [phase, setPhase] = useState<"intro" | "play" | "between" | "done">("intro");
  const [n, setN] = useState(4);
  const [cells, setCells] = useState<(number | null)[]>([]);
  const [next, setNext] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [strikes, setStrikes] = useState(0);
  const [lastOk, setLastOk] = useState(true);
  const deal = (k: number) => {
    const c: (number | null)[] = Array(40).fill(null);
    shuffle(Array.from({ length: 40 }, (_, i) => i)).slice(0, k).forEach((s, i) => { c[s] = i + 1; });
    setCells(c); setNext(1); setHidden(false); setN(k); setPhase("play");
  };
  const press = (v: number | null) => {
    if (v == null) return;
    if (v !== next) {
      const s = strikes + 1;
      setStrikes(s); setLastOk(false);
      if (s >= 3) { save(n - 1); return setPhase("done"); }
      return setPhase("between");
    }
    if (v === 1) setHidden(true);
    setCells((c) => c.map((x) => (x === v ? null : x)));
    if (v === n) { setLastOk(true); setN(n + 1); setPhase("between"); } else setNext(v + 1);
  };
  if (phase === "intro") return <div className={b.hero}><Intro m={m} line="Click the squares in order according to their numbers. The test will get progressively harder." onStart={() => { setStrikes(0); deal(4); }} /></div>;
  if (phase === "done") return <div className={b.hero}><Result m={m} score={`${n - 1} numbers`} onAgain={() => setPhase("intro")} /></div>;
  if (phase === "between")
    return (
      <div className={b.hero}>
        <div className={b.center}>
          <div className={b.label}>NUMBERS</div><div className={b.big}>{lastOk ? n : n}</div>
          <div className={b.label}>STRIKES</div><div className={b.mid}>{strikes} of 3</div>
          <button className={b.btn} onClick={() => deal(lastOk ? n : n)}>Continue</button>
        </div>
      </div>
    );
  return <div className={b.hero}><div className={b.chimp}>{cells.map((v, i) => <button key={i} data-on={v != null} onMouseDown={() => press(v)}>{v != null && !hidden ? v : ""}</button>)}</div></div>;
}

/* ---------- visual memory ---------- */
function Visual({ m, save }: { m: Meta; save: Save }) {
  const [phase, setPhase] = useState<"intro" | "show" | "play" | "done">("intro");
  const [lvl, setLvl] = useState(1);
  const [lives, setLives] = useState(3);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [got, setGot] = useState<Set<number>>(new Set());
  const [bad, setBad] = useState<Set<number>>(new Set());
  const size = lvl <= 2 ? 3 : lvl <= 5 ? 4 : lvl <= 8 ? 5 : lvl <= 12 ? 6 : 7;
  const start = useCallback((l: number) => {
    const sz = l <= 2 ? 3 : l <= 5 ? 4 : l <= 8 ? 5 : l <= 12 ? 6 : 7;
    setLvl(l); setGot(new Set()); setBad(new Set());
    setLit(new Set(shuffle(Array.from({ length: sz * sz }, (_, i) => i)).slice(0, l + 2)));
    setPhase("show"); setTimeout(() => setPhase("play"), 1400);
  }, []);
  const press = (i: number) => {
    if (phase !== "play" || got.has(i) || bad.has(i)) return;
    if (lit.has(i)) {
      const g = new Set(got); g.add(i); setGot(g);
      if (g.size === lit.size) setTimeout(() => start(lvl + 1), 500);
    } else {
      const bd = new Set(bad); bd.add(i); setBad(bd);
      if (bd.size >= 3) {
        if (lives <= 1) { setLives(0); save(lvl - 1); setPhase("done"); }
        else { setLives(lives - 1); setTimeout(() => start(lvl), 600); }
      }
    }
  };
  if (phase === "intro") return <div className={b.hero}><Intro m={m} line="Memorize the squares." onStart={() => { setLives(3); start(1); }} /></div>;
  if (phase === "done") return <div className={b.hero}><Result m={m} score={`Level ${lvl - 1}`} onAgain={() => setPhase("intro")} /></div>;
  return (
    <div className={b.hero}>
      <div className={b.stats}><span>Level <b>{lvl}</b></span><span>Lives <b>{lives}</b></span></div>
      <div className={b.vgrid} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {Array.from({ length: size * size }, (_, i) => <button key={i} data-state={(phase === "show" && lit.has(i)) || got.has(i) ? "on" : bad.has(i) ? "bad" : undefined} onMouseDown={() => press(i)} aria-label={`Tile ${i + 1}`} />)}
      </div>
    </div>
  );
}

/* ---------- typing ---------- */
const PASSAGES = [
  "The way to get started is to quit talking and begin doing. Small steps taken every day add up to results that surprise everyone, including you.",
  "Momentum is conserved in every collision, but kinetic energy is only conserved when the collision is perfectly elastic and nothing is lost as heat or sound.",
  "A good revision session has a clear goal, a timer, no phone within reach, and ends with a few minutes of testing yourself on what you just learned.",
  "Chess rewards patience: control the centre, develop your pieces, keep your king safe, and look for the tactic your opponent has just allowed.",
];
function Typing({ m, save }: { m: Meta; save: Save }) {
  const [text, setText] = useState(PASSAGES[0]);
  const [v, setV] = useState("");
  const [t0, setT0] = useState<number | null>(null);
  const [res, setRes] = useState<{ wpm: number; acc: number } | null>(null);
  useEffect(() => { queueMicrotask(() => setText(PASSAGES[rnd(PASSAGES.length)])); }, []);
  if (res) return <div className={b.hero}><Result m={m} score={`${res.wpm} wpm`} sub={`${res.acc}% accuracy`} onAgain={() => { setRes(null); setV(""); setT0(null); setText(PASSAGES[rnd(PASSAGES.length)]); }} /></div>;
  return (
    <div className={b.hero}>
      <div className={b.center}>
        <div className={b.icon}>⌨</div>
        <h2 className={b.title}>Typing Test</h2>
        <p>How many words per minute can you type?</p>
        <div className={b.typeBox} onClick={(e) => (e.currentTarget.querySelector("textarea") as HTMLTextAreaElement)?.focus()}>
          {[...text].map((ch, i) => <span key={i} data-s={i >= v.length ? (i === v.length ? "cur" : undefined) : v[i] === ch ? "ok" : "bad"}>{ch}</span>)}
          <textarea autoFocus value={v} aria-label="Type here" onChange={(e) => {
            const nv = e.target.value;
            const start = t0 ?? now();
            if (t0 == null) setT0(start);
            setV(nv);
            if (nv.length >= text.length) {
              const mins = (now() - start) / 60000, correct = [...nv].filter((c, i) => c === text[i]).length;
              const r = { wpm: Math.round(correct / 5 / mins), acc: Math.round((correct / text.length) * 100) };
              setRes(r); save(r.wpm);
            }
          }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- statistics under each test ---------- */
type Res = { score: number; created_at: string };
function Stats({ m, rows }: { m: Meta; rows: Res[] }) {
  if (!rows.length) return <p className={b.dim}>No attempts yet. Your scores, distribution and progress will show here.</p>;
  const vals = rows.map((r) => Number(r.score));
  const best = m.better === "higher" ? Math.max(...vals) : Math.min(...vals);
  const avg = Math.round((vals.reduce((a, c) => a + c, 0) / vals.length) * 10) / 10;
  const sorted = [...vals].sort((a, c) => a - c);
  const median = sorted[Math.floor(sorted.length / 2)];
  const last = vals[0];
  const pctile = Math.round((vals.filter((x) => (m.better === "higher" ? x <= last : x >= last)).length / vals.length) * 100);
  const last10 = vals.slice(0, 10), prev10 = vals.slice(10, 20);
  const mean = (xs: number[]) => xs.reduce((a, c) => a + c, 0) / xs.length;
  const change = prev10.length ? Math.round(((mean(last10) - mean(prev10)) / mean(prev10)) * 100) : null;
  const lo = sorted[0], hi = sorted[sorted.length - 1], bins = Math.min(12, Math.max(4, Math.ceil(Math.sqrt(vals.length)) + 2)), w = (hi - lo) / bins || 1;
  const hist = Array.from({ length: bins }, (_, i) => ({ label: `${Math.round(lo + i * w)}`, value: 0 }));
  for (const v of vals) hist[Math.min(bins - 1, Math.floor((v - lo) / w))].value++;
  const trend = [...rows].reverse().slice(-30).map((r, i) => ({ label: String(i + 1), value: Number(r.score) }));
  return (
    <div className={b.statWrap}>
      <div className={b.kpis}>
        <div><span>Best</span><b>{best} {m.unit}</b></div>
        <div><span>Average</span><b>{avg} {m.unit}</b></div>
        <div><span>Median</span><b>{median} {m.unit}</b></div>
        <div><span>Attempts</span><b>{vals.length}</b></div>
        <div><span>Last score</span><b>{last} {m.unit}</b><small>better than {pctile}% of your attempts</small></div>
        <div><span>Last 10 vs previous 10</span><b>{change == null ? "—" : `${change > 0 ? "+" : ""}${change}%`}</b><small>{m.better === "lower" ? "lower is better" : "higher is better"}</small></div>
      </div>
      <div className={b.charts}>
        <div><span className={b.dim}>Your score distribution</span><Bars series={hist} h={120} /></div>
        <div><span className={b.dim}>Last {trend.length} attempts</span><Bars series={trend} h={120} /></div>
      </div>
    </div>
  );
}

export function Benchmark({ ctx, p }: { ctx: BlockCtx; p: Record<string, unknown> }) {
  const { changes } = useApollo();
  const [test, setTest] = useState<TestId | null>((p.test as TestId) ?? null);
  const [rows, setRows] = useState<(Res & { test: string })[]>([]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "brain_test_results", limit: 500, order: { col: "created_at", asc: false } }] }) })
      .then((r) => (r.ok ? r.json() : [])).then((j) => setRows(j?.[0]?.rows ?? [])).catch(() => {});
  }, [changes, tick]);
  const m = TESTS.find((t) => t.id === test);
  const save = (id: TestId, unit: string) => (score: number) => { void ctx.write("create", "brain_test_results", { test: id, score, unit }).then(() => setTick((t) => t + 1)); };
  const bestOf = (t: Meta) => { const v = rows.filter((r) => r.test === t.id).map((r) => Number(r.score)); return v.length ? (t.better === "higher" ? Math.max(...v) : Math.min(...v)) : null; };

  if (!m)
    return (
      <div className={b.home}>
        {TESTS.map((t) => (
          <button key={t.id} className={b.card} onClick={() => setTest(t.id)}>
            <span className={b.cardIcon}>{t.icon}</span>
            <b>{t.name}</b>
            <small>{t.blurb}</small>
            <em>{bestOf(t) == null ? "Not played yet" : `Best: ${bestOf(t)} ${t.unit}`}</em>
          </button>
        ))}
      </div>
    );
  const Comp = { reaction: Reaction, sequence: Sequence, aim: Aim, numbers: NumberMemory, verbal: Verbal, chimp: Chimp, visual: Visual, typing: Typing }[m.id];
  return (
    <div className={b.page}>
      {!p.test && <button className={b.back} onClick={() => setTest(null)}>← All tests</button>}
      <Comp key={m.id} m={m} save={save(m.id, m.unit)} />
      <div className={b.below}>
        <section><h3>Statistics</h3><Stats m={m} rows={rows.filter((r) => r.test === m.id)} /></section>
        <section><h3>About the test</h3><p className={b.dim}>{m.about}</p></section>
      </div>
    </div>
  );
}
