"use client";
// Phase 8-11 blocks: spaced-repetition review, ask-Apollo prompts, weekly scores,
// brain tests and the geography quiz. All numbers come from code or datasets.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { previewLabel, GRADES, type Grade } from "@/core/srsCore";
import { useApollo } from "@/shell/apollo";
import COUNTRIES from "@/data/countries.json";
import type { BlockCtx } from "./Blocks";
import { useOptions } from "./useOptions";
import { Chimp, Verbal, Visual } from "./Blocks3";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Card = { id: string; [k: string]: any };
const NoData = ({ children }: { children?: React.ReactNode }) => <div className={u.nodata}>{children ?? "no data"}</div>;

/* ---------- spaced repetition ---------- */
// Offline: grades made without a connection are queued on this device and sent when back online.
const QKEY = "noesis.reviewQueue";
function queueOffline(body: string) {
  try { const q = JSON.parse(localStorage.getItem(QKEY) ?? "[]"); q.push(body); localStorage.setItem(QKEY, JSON.stringify(q)); } catch {}
}
async function flushOffline() {
  let q: string[] = [];
  try { q = JSON.parse(localStorage.getItem(QKEY) ?? "[]"); } catch { return; }
  if (!q.length || !navigator.onLine) return;
  const left: string[] = [];
  for (const body of q) {
    const ok = await fetch("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.ok).catch(() => false);
    if (!ok) left.push(body);
  }
  try { localStorage.setItem(QKEY, JSON.stringify(left)); } catch {}
}
export function Review({ p }: { p: P }) {
  const decks: string[] = p.decks ?? (p.deck ? [p.deck] : []);
  const decksKey = decks.join(",");
  // "" = all of this block's decks together
  const [deck, setDeck] = useState<string>(decks.length === 1 ? decks[0] : "");
  const [state, setState] = useState<{ cards: Card[]; due: number; total: number; learned: number } | null>(null);
  const [flip, setFlip] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    const q = deck ? `deck=${encodeURIComponent(deck)}` : decksKey ? `decks=${encodeURIComponent(decksKey)}` : "";
    fetch(`/api/review${q ? `?${q}` : ""}`)
      .then(async (r) => (r.ok ? setState(await r.json()) : setErr(r.status === 503 ? "no data (database not connected)" : "couldn't load")))
      .catch(() => setErr("couldn't load"));
  }, [deck, decksKey]);
  useEffect(load, [load]);
  const card = state?.cards[0];
  const grade = async (g: Grade) => {
    if (!card) return;
    setFlip(false);
    setState((s) => (s ? { ...s, cards: g === 0 ? [...s.cards.slice(1), card] : s.cards.slice(1), due: g === 0 ? s.due : s.due - 1 } : s));
    const body = JSON.stringify({ id: card.id, grade: g });
    const ok = await fetch("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.ok).catch(() => false);
    if (!ok) queueOffline(body);
  };
  useEffect(() => {
    const flush = () => void flushOffline();
    window.addEventListener("online", flush);
    flush();
    return () => window.removeEventListener("online", flush);
  }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select")) return;
      if (e.key === "Enter" && !flip) setFlip(true);
      if (flip && ["1", "2", "3", "4"].includes(e.key)) void grade((Number(e.key) - 1) as Grade);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  return (
    <div className={u.flash}>
      {decks.length > 1 && (
        <div className={u.row}>
          {["", ...decks].map((d) => <button key={d || "all"} className="pill" aria-pressed={d === deck} onClick={() => { setDeck(d); setFlip(false); }}>{d || "All"}</button>)}
        </div>
      )}
      {err ? <NoData>{err}</NoData> : !state ? null : !card ? (
        <NoData>{state.total ? `All done: nothing due. ${state.learned}/${state.total} cards learned.` : "No cards yet. Add some, or ask Apollo to make them from your notes."}</NoData>
      ) : (
        <>
          <button className={u.flashCard} data-flip={flip} onClick={() => setFlip(true)}>
            <span>{flip ? card.back : card.front}</span>
            <small className="label">{card.deck}{card.topic ? ` · ${card.topic}` : ""} · {flip ? "how well did you know it?" : "tap or Enter to reveal"}</small>
          </button>
          {flip ? (
            <div className={u.row}>
              {GRADES.map((g, i) => (
                <button key={g} className="pill" data-active={i === 2} onClick={() => grade(i as Grade)} title={`Key ${i + 1}`}>
                  {g} <small style={{ opacity: 0.7 }}>{previewLabel(card, i as Grade)}</small>
                </button>
              ))}
            </div>
          ) : <div className="label">{state.due} due · {state.learned}/{state.total} learned</div>}
        </>
      )}
    </div>
  );
}

/* ---------- ask Apollo (templated prompt, optional mode) ---------- */
function AskSelect({ f }: { f: { name: string; options?: string[]; optionsFrom?: { table: string; field: string } } }) {
  const opts = useOptions(f.optionsFrom, f.options ?? []);
  return <select name={f.name}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
}
export function AskBlock({ p }: { p: P }) {
  const { submit, reply } = useApollo();
  const fields: { name: string; label?: string; type?: string; options?: string[]; optionsFrom?: { table: string; field: string } }[] = p.fields ?? [{ name: "text", label: p.placeholder ?? "Your question", type: "textarea" }];
  const [sent, setSent] = useState(false);
  return (
    <form className={u.form} onSubmit={(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      let text = String(p.template ?? "{text}");
      let thread: string | undefined = p.thread;
      for (const f of fields) {
        const v = String(fd.get(f.name) ?? "");
        text = text.replaceAll(`{${f.name}}`, v);
        thread = thread?.replaceAll(`{${f.name}}`, v);
      }
      submit(text, { mode: p.mode, model: p.model, thread });
      setSent(true);
      (e.target as HTMLFormElement).reset();
    }}>
      {fields.map((f) => (
        <label key={f.name} data-wide={f.type === "textarea"}>
          <span className="label">{f.label ?? f.name}</span>
          {f.type === "select" ? <AskSelect f={f} />
            : f.type === "textarea" ? <textarea name={f.name} rows={p.rows ?? 3} required /> : <input name={f.name} required />}
        </label>
      ))}
      <button className="pill" data-active="true">{p.submit ?? "Ask Apollo"}</button>
      {sent && reply && <div className={u.askReply} data-wide="true">{reply.text || "…"}</div>}
    </form>
  );
}

/* ---------- sync from a public API ---------- */
export function SyncBlock({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className={u.row}>
      <button className="pill" data-active="true" onClick={async () => {
        setMsg("Syncing…");
        const r = await fetch(`/api/sync/${p.service}`, { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "couldn't reach the server" }));
        setMsg(r.error ?? (p.service === "chess" ? `${r.added} new games for ${r.user}` : `rating ${r.rating ?? "unrated"}, ${r.solved} solved`));
        if (!r.error) ctx.refresh?.();
      }}>{p.label ?? `Sync ${p.service}`}</button>
      {msg && <span className="label">{msg}</span>}
    </div>
  );
}

/* ---------- weekly scores ---------- */
type Scores = { week: string; overall: number | null; grade: string | null; areas: { area: string; score: number | null; actual: number | null; target: number; unit: string; formula: string }[] };
export function ScoresBlock({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const [weeksAgo, setWeeksAgo] = useState(Number(p.weeksAgo ?? 0));
  const [s, setS] = useState<Scores | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  useEffect(() => {
    fetch(`/api/scores?weeksAgo=${weeksAgo}`).then(async (r) => (r.ok ? setS(await r.json()) : setErr("no data (database not connected)"))).catch(() => setErr("couldn't load"));
  }, [weeksAgo, ctx.data]);
  if (err) return <NoData>{err}</NoData>;
  if (!s) return null;
  return (
    <div className={u.scores}>
      <div className={u.scoresHead}>
        <div><div className="display">{s.grade ?? "—"}</div><small>{s.overall == null ? "no data" : `${s.overall}/100`} · week of {new Date(s.week).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></div>
        <div className={u.row}>
          <button className="pill" onClick={() => setWeeksAgo((w) => w + 1)}>‹ Earlier</button>
          <button className="pill" disabled={weeksAgo === 0} onClick={() => setWeeksAgo((w) => Math.max(0, w - 1))}>Later ›</button>
          {p.report !== false && (
            <button className="pill" data-active="true" disabled={queued} onClick={async () => {
              await fetch("/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "report", input: { weeks_ago: weeksAgo } }) });
              setQueued(true);
            }}>{queued ? "Report queued → Inbox" : "Write report"}</button>
          )}
        </div>
      </div>
      <ul className={u.scoreList}>
        {s.areas.map((a) => (
          <li key={a.area} title={`${a.formula}. Target ${a.target} ${a.unit}.`}>
            <span>{a.area}</span>
            <i><b style={{ width: `${a.score ?? 0}%` }} /></i>
            <span>{a.score == null ? "no data" : `${a.score}`}</span>
            <small>{a.actual == null ? "" : `${a.actual} / ${a.target} ${a.unit}`}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- brain tests (humanbenchmark-style) ---------- */
const rnd9 = () => Math.floor(Math.random() * 9);
function useLog(ctx: BlockCtx, test: string) {
  return (score: number, unit: string) => ctx.write("create", "brain_test_results", { test, score, unit });
}

function Reaction({ ctx }: { ctx: BlockCtx }) {
  const [st, setSt] = useState<"idle" | "wait" | "go" | "early" | "done">("idle");
  const [ms, setMs] = useState(0);
  const t0 = useRef(0), timer = useRef<number | null>(null);
  const log = useLog(ctx, "reaction");
  const click = () => {
    if (st === "idle" || st === "done" || st === "early") {
      setSt("wait");
      timer.current = window.setTimeout(() => { t0.current = performance.now(); setSt("go"); }, 1200 + Math.random() * 2800);
    } else if (st === "wait") { if (timer.current) clearTimeout(timer.current); setSt("early"); }
    else if (st === "go") { const r = Math.round(performance.now() - t0.current); setMs(r); setSt("done"); void log(r, "ms"); }
  };
  const msg = { idle: "Click to start", wait: "Wait for it…", go: "CLICK!", early: "Too early. Click to retry", done: `${ms} ms · click to go again` }[st];
  return <button className={u.game} data-state={st} onClick={click}>{msg}</button>;
}

function NumberMemory({ ctx }: { ctx: BlockCtx }) {
  const [level, setLevel] = useState(3);
  const [num, setNum] = useState("");
  const [phase, setPhase] = useState<"idle" | "show" | "input" | "over">("idle");
  const log = useLog(ctx, "number_memory");
  const start = (n: number) => {
    const s = Array.from({ length: n }, (_, i) => String(Math.floor(Math.random() * 10) + (i === 0 ? 0 : 0))).join("");
    setNum(s); setPhase("show");
    setTimeout(() => setPhase("input"), 900 + n * 600);
  };
  if (phase === "idle") return <button className={u.game} onClick={() => start(level)}>Number memory: remember the number. Click to start</button>;
  if (phase === "show") return <div className={u.game}><span className="display">{num}</span></div>;
  if (phase === "over") return <button className={u.game} onClick={() => { setLevel(3); start(3); }}>Reached {level - 1} digits. Click to retry</button>;
  return (
    <form className={u.game} onSubmit={(e) => {
      e.preventDefault();
      const v = String(new FormData(e.currentTarget).get("n") ?? "");
      if (v === num) { setLevel(level + 1); start(level + 1); }
      else { setPhase("over"); void log(level - 1, "digits"); }
    }}>
      <input name="n" autoFocus inputMode="numeric" autoComplete="off" placeholder="Type the number" className={u.gameInput} />
    </form>
  );
}

function Sequence({ ctx }: { ctx: BlockCtx }) {
  const [seq, setSeq] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [pos, setPos] = useState(0);
  const [phase, setPhase] = useState<"idle" | "show" | "input" | "over">("idle");
  const log = useLog(ctx, "sequence");
  const play = (s: number[]) => {
    setPhase("show"); setPos(0);
    s.forEach((c, i) => { setTimeout(() => setLit(c), 500 + i * 650); setTimeout(() => setLit(null), 900 + i * 650); });
    setTimeout(() => setPhase("input"), 600 + s.length * 650);
  };
  const press = (c: number) => {
    if (phase !== "input") return;
    setLit(c); setTimeout(() => setLit(null), 150);
    if (seq[pos] !== c) { setPhase("over"); void log(seq.length - 1, "level"); return; }
    if (pos + 1 === seq.length) { const n = [...seq, rnd9()]; setSeq(n); setTimeout(() => play(n), 500); }
    else setPos(pos + 1);
  };
  return (
    <div className={u.seqWrap}>
      <div className={u.seq}>{Array.from({ length: 9 }, (_, i) => <button key={i} data-lit={lit === i} onClick={() => press(i)} aria-label={`Tile ${i + 1}`} />)}</div>
      {phase !== "input" && phase !== "show" && (
        <button className="pill" data-active="true" onClick={() => { const s = [rnd9()]; setSeq(s); play(s); }}>
          {phase === "over" ? `Level ${seq.length - 1}. Retry` : "Start sequence memory"}
        </button>
      )}
      {(phase === "show" || phase === "input") && <div className="label">Level {seq.length} · {phase === "show" ? "watch" : "repeat"}</div>}
    </div>
  );
}

const TEXTS = [
  "The quick brown fox jumps over the lazy dog while the orb hums quietly in the dark.",
  "Revision is not reading notes again; it is forcing your memory to bring the answer back.",
  "Momentum is conserved in every collision, but kinetic energy is only conserved when the collision is elastic.",
];
function Typing({ ctx }: { ctx: BlockCtx }) {
  const [text, setText] = useState(TEXTS[0]);
  useEffect(() => { queueMicrotask(() => setText(TEXTS[Math.floor(Math.random() * TEXTS.length)])); }, []);
  const [v, setV] = useState("");
  const [t0, setT0] = useState<number | null>(null);
  const [res, setRes] = useState<string | null>(null);
  const log = useLog(ctx, "typing");
  return (
    <div className={u.typing}>
      <p>{[...text].map((ch, i) => <span key={i} data-s={i >= v.length ? undefined : v[i] === ch ? "ok" : "bad"}>{ch}</span>)}</p>
      <input className={u.gameInput} value={v} placeholder="Start typing…" disabled={!!res} onChange={(e) => {
        const nv = e.target.value;
        const start = t0 ?? performance.now();
        if (t0 == null) setT0(start);
        setV(nv);
        if (nv.length >= text.length) {
          const mins = (performance.now() - start) / 60000;
          const correct = [...nv].filter((c, i) => c === text[i]).length;
          const wpm = Math.round(correct / 5 / mins);
          setRes(`${wpm} wpm · ${Math.round((correct / text.length) * 100)}% accuracy`);
          void log(wpm, "wpm");
        }
      }} />
      {res && <div className="label">{res}</div>}
    </div>
  );
}

export function BrainGame({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const tests = ["reaction", "numbers", "sequence", "chimp", "verbal", "visual", "typing"] as const;
  const [t, setT] = useState<(typeof tests)[number]>(p.test ?? "reaction");
  return (
    <div className={u.games}>
      {!p.test && <div className={u.row}>{tests.map((x) => <button key={x} className="pill" aria-pressed={x === t} onClick={() => setT(x)}>{x}</button>)}</div>}
      {t === "reaction" ? <Reaction ctx={ctx} /> : t === "numbers" ? <NumberMemory ctx={ctx} /> : t === "sequence" ? <Sequence ctx={ctx} /> : t === "chimp" ? <Chimp ctx={ctx} /> : t === "verbal" ? <Verbal ctx={ctx} /> : t === "visual" ? <Visual ctx={ctx} /> : <Typing ctx={ctx} />}
    </div>
  );
}

/* ---------- geography (dataset, not AI) ---------- */
type Country = { n: string; c: string; r: string; s: string; k: string; a: number };
const ALL = COUNTRIES as Country[];
export function GeoQuiz({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const kinds = ["flag", "capital", "country-of-capital", "bigger"] as const;
  const [kind, setKind] = useState<(typeof kinds)[number]>(p.kind ?? "flag");
  const [region, setRegion] = useState<string>(p.region ?? "All");
  // misses this session are asked again sooner (simple in-session spaced repetition)
  const misses = useRef<Country[]>([]);
  const pool = useMemo(() => (region === "All" ? ALL : ALL.filter((c) => c.r === region)), [region]);
  const make = useCallback(() => {
    const pick = misses.current.length && Math.random() < 0.4 ? misses.current.shift()! : pool[Math.floor(Math.random() * pool.length)];
    // confusable distractors: same subregion first, then same region
    const near = ALL.filter((c) => c.k !== pick.k && c.s === pick.s);
    const wide = ALL.filter((c) => c.k !== pick.k && c.r === pick.r && c.s !== pick.s);
    const opts = [...near.sort(() => Math.random() - 0.5), ...wide.sort(() => Math.random() - 0.5)].slice(0, 3);
    const other = kind === "bigger" ? near[0] ?? wide[0] : null;
    return { pick, choices: [pick, ...opts].sort(() => Math.random() - 0.5), other };
  }, [pool, kind]);
  const [q, setQ] = useState<ReturnType<typeof make> | null>(null);
  const [ans, setAns] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  useEffect(() => { queueMicrotask(() => { setQ(make()); setAns(null); }); }, [make]);
  if (!q) return null;
  const correctKey = kind === "bigger" && q.other ? (q.pick.a >= q.other.a ? q.pick.k : q.other.k) : q.pick.k;
  const choose = (k: string) => {
    if (ans) return;
    setAns(k);
    const ok = k === correctKey;
    if (!ok) misses.current.push(q.pick);
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    void ctx.write("create", "geo_attempts", { kind, item: q.pick.n, answer: ALL.find((c) => c.k === k)?.n ?? k, correct: ok });
  };
  const label = (c: Country) => (kind === "country-of-capital" ? c.n : kind === "capital" ? c.c : c.n);
  return (
    <div className={u.geo}>
      <div className={u.row}>
        {kinds.map((x) => <button key={x} className="pill" aria-pressed={x === kind} onClick={() => setKind(x)}>{x.replaceAll("-", " ")}</button>)}
        <select value={region} onChange={(e) => setRegion(e.target.value)} className={u.geoSel}>
          {["All", "Africa", "Americas", "Asia", "Europe", "Oceania"].map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div className={u.geoQ}>
        {kind === "flag" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`https://flagcdn.com/w320/${q.pick.k}.png`} alt="Flag to identify" />
        )}
        {kind === "capital" && <p>What is the capital of <b>{q.pick.n}</b>?</p>}
        {kind === "country-of-capital" && <p><b>{q.pick.c}</b> is the capital of…</p>}
        {kind === "bigger" && q.other && <p>Which is bigger by area?</p>}
      </div>
      <div className={u.choices}>
        {(kind === "bigger" && q.other ? [q.pick, q.other] : q.choices).map((c) => (
          <button key={c.k} data-state={ans ? (c.k === correctKey ? "right" : c.k === ans ? "wrong" : undefined) : undefined} onClick={() => choose(c.k)}>
            {kind === "bigger" ? c.n : label(c)}
            {ans && kind === "bigger" && <small> · {c.a.toLocaleString()} km²</small>}
          </button>
        ))}
      </div>
      <div className={u.row}>
        <span className="label">{score.right}/{score.total} this session</span>
        {ans && <button className="pill" data-active="true" onClick={() => { setQ(make()); setAns(null); }}>Next</button>}
      </div>
    </div>
  );
}
