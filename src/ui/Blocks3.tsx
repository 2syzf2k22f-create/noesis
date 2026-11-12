"use client";
// Dashboard blocks: timetable, agenda, tiles, insights, score history, inbox,
// plus the remaining brain tests (chimp, verbal, visual) and card memory.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const NoData = ({ children }: { children?: React.ReactNode }) => <div className={u.nodata}>{children ?? "no data"}</div>;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hm = (t: string) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };

/* ---------- timetable: today (now / next) or the week ---------- */
export function Timetable({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const rows = (ctx.data?.rows ?? []) as Row[];
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { const f = () => setNow(new Date()); f(); const id = setInterval(f, 30_000); return () => clearInterval(id); }, []);
  if (ctx.data?.error) return <NoData>{ctx.data.error}</NoData>;
  if (!rows.length) return <NoData>No timetable yet. Add lessons on School → Timetable, or ask Apollo to enter it from a photo or list.</NoData>;
  if (!now) return null;
  const dow = (now.getDay() + 6) % 7 + 1, mins = now.getHours() * 60 + now.getMinutes();
  const sorted = [...rows].sort((a, b) => Number(a.day) - Number(b.day) || hm(a.start) - hm(b.start));
  if (p.view === "week") {
    const days = [...new Set(sorted.map((r) => Number(r.day)))].filter((d) => d <= 5 || sorted.some((r) => Number(r.day) === d));
    return (
      <div className={u.tt} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(110px, 1fr))` }}>
        {days.map((d) => (
          <div key={d} data-today={d === dow}>
            <div className="label">{DAYS[d - 1]}</div>
            {sorted.filter((r) => Number(r.day) === d).map((r) => (
              <div key={r.id} className={u.ttLesson} data-now={d === dow && mins >= hm(r.start) && mins < hm(r.end)}>
                <b>{r.subject}</b><small>{r.start}–{r.end}{r.room ? ` · ${r.room}` : ""}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }
  const today = sorted.filter((r) => Number(r.day) === dow);
  const cur = today.find((r) => mins >= hm(r.start) && mins < hm(r.end));
  const next = today.find((r) => hm(r.start) > mins);
  if (!today.length) {
    const nd = sorted.find((r) => Number(r.day) > dow) ?? sorted[0];
    return <NoData>No lessons today. Next: {nd.subject}, {DAYS[nd.day - 1]} {nd.start}.</NoData>;
  }
  return (
    <div className={u.ttToday}>
      <div className={u.ttNow}>
        <div><span className="label">Now</span><b>{cur ? cur.subject : "Free"}</b>{cur && <small>until {cur.end}{cur.room ? ` · ${cur.room}` : ""}</small>}</div>
        <div><span className="label">Next</span><b>{next ? next.subject : "Done for today"}</b>{next && <small>{next.start}{next.room ? ` · ${next.room}` : ""} · in {hm(next.start) - mins} min</small>}</div>
      </div>
      <ol className={u.ttList}>
        {today.map((r) => (
          <li key={r.id} data-state={r === cur ? "now" : hm(r.end) <= mins ? "past" : undefined}>
            <span>{r.start}</span><b>{r.subject}</b><small>{r.room ?? ""}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- agenda ---------- */
type Item = { at: string; title: string; kind: string; sub?: string; href?: string };
export function Agenda({ p }: { p: P }) {
  const { changes } = useApollo();
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/agenda?days=${p.days ?? 14}`).then(async (r) => (r.ok ? setItems(await r.json()) : setErr("no data (database not connected)"))).catch(() => setErr("couldn't load"));
  }, [p.days, changes]);
  if (err) return <NoData>{err}</NoData>;
  if (!items) return null;
  if (!items.length) return <NoData>Nothing due in the next {p.days ?? 14} days.</NoData>;
  const label = (iso: string) => {
    const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t.getTime()) / 864e5);
    return diff < 0 ? "overdue" : diff === 0 ? "today" : diff === 1 ? "tomorrow" : d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };
  return (
    <ul className={u.agenda}>
      {items.slice(0, p.limit ?? 12).map((it, i) => {
        const when = label(it.at);
        const body = (<><span data-when={when}>{when}</span><b>{it.title}</b><small>{it.kind}{it.sub ? ` · ${it.sub}` : ""}</small></>);
        return <li key={i}>{it.href?.startsWith("/") ? <Link href={it.href}>{body}</Link> : it.href ? <a href={it.href} target="_blank" rel="noreferrer">{body}</a> : <div>{body}</div>}</li>;
      })}
    </ul>
  );
}

/* ---------- tile: link card to a subpage with one live number ---------- */
export function Tile({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const d = ctx.data;
  const v = d?.value ?? (d?.series ? d.series.reduce((a, s) => a + s.value, 0) : d?.rows ? d.rows.length : null);
  return (
    <Link href={p.href ?? "#"} className={u.tile}>
      <span className="label">{p.label}</span>
      <b className="display">{d ? (v == null ? "—" : `${Math.round(v * 10) / 10}${p.unit ? ` ${p.unit}` : ""}`) : " "}</b>
      <small>{p.caption ?? ""}</small>
      <i aria-hidden>→</i>
    </Link>
  );
}

/* ---------- insights (computed in code) ---------- */
export function Insights() {
  const { changes } = useApollo();
  const [list, setList] = useState<{ title: string; detail: string; tone: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/insights").then(async (r) => (r.ok ? setList(await r.json()) : setErr("no data (database not connected)"))).catch(() => setErr("couldn't load")); }, [changes]);
  if (err) return <NoData>{err}</NoData>;
  if (!list) return null;
  if (!list.length) return <NoData>Not enough logged yet to see patterns.</NoData>;
  return <ul className={u.insights}>{list.map((x) => <li key={x.title} data-tone={x.tone}><b>{x.title}</b><small>{x.detail}</small></li>)}</ul>;
}

/* ---------- score history: stacked weekly chart ---------- */
export function ScoreHistory() {
  const [rows, setRows] = useState<{ week: string; overall: number | null; areas: Record<string, number | null> }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/insights?history=1").then(async (r) => (r.ok ? setRows(await r.json()) : setErr("no data (database not connected)"))).catch(() => setErr("couldn't load")); }, []);
  if (err) return <NoData>{err}</NoData>;
  if (!rows) return null;
  const areas = Object.keys(rows[0]?.areas ?? {});
  const max = Math.max(1, ...rows.map((r) => areas.reduce((a, k) => a + (r.areas[k] ?? 0), 0)));
  return (
    <div className={u.stack}>
      <div className={u.stackBars}>
        {rows.map((r) => (
          <div key={r.week} title={`Week of ${r.week}: ${r.overall ?? "no data"}`}>
            <span className={u.stackCol}>
              {areas.map((k, i) => r.areas[k] ? <i key={k} style={{ height: `${(r.areas[k]! / max) * 100}%`, background: `var(--chart-${(i % 4) + 1})`, opacity: 0.55 + (i % 3) * 0.15 }} /> : null)}
            </span>
            <small>{r.week.slice(5)}</small>
          </div>
        ))}
      </div>
      <ul className={u.legend}>{areas.map((k, i) => <li key={k}><i style={{ background: `var(--chart-${(i % 4) + 1})`, opacity: 0.55 + (i % 3) * 0.15 }} />{k}</li>)}</ul>
    </div>
  );
}

/* ---------- inbox list with go-to and mark read ---------- */
export function InboxList({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const rows = (ctx.data?.rows ?? []) as Row[];
  const [now, setNow] = useState(0);
  useEffect(() => { queueMicrotask(() => setNow(Date.now())); }, [rows.length]);
  if (ctx.data?.error) return <NoData>{ctx.data.error}</NoData>;
  if (!rows.length) return <NoData>Inbox zero.</NoData>;
  const ago = (iso: string) => { const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000)); return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
  return (
    <ul className={u.inbox}>
      {rows.slice(0, p.limit ?? 30).map((r) => (
        <li key={r.id} data-read={!!r.read_at}>
          <span className="label">{r.source} · {ago(r.created_at)}{r.due_at ? ` · due ${new Date(r.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}</span>
          <b>{r.title}</b>
          {r.body && <p>{String(r.body).slice(0, 220)}</p>}
          <div className={u.row}>
            {r.link && (String(r.link).startsWith("/") ? <Link className={u.rowBtn} href={r.link}>Go to</Link> : <a className={u.rowBtn} href={r.link} target="_blank" rel="noreferrer">Go to</a>)}
            {!r.read_at && <button className={u.rowBtn} onClick={() => ctx.write("update", "inbox_items", { read_at: new Date().toISOString() }, r.id)}>Mark read</button>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ---------- more brain tests ---------- */
const rnd = (n: number) => Math.floor(Math.random() * n);
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = rnd(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };

export function Chimp({ ctx }: { ctx: BlockCtx }) {
  const [n, setN] = useState(4);
  const [cells, setCells] = useState<(number | null)[]>([]);
  const [next, setNext] = useState(1);
  const [hidden, setHidden] = useState(false);
  const [over, setOver] = useState<number | null>(null);
  const start = (k: number) => {
    const slots = shuffle(Array.from({ length: 40 }, (_, i) => i)).slice(0, k);
    const c: (number | null)[] = Array(40).fill(null);
    slots.forEach((s, i) => { c[s] = i + 1; });
    setCells(c); setNext(1); setHidden(false); setOver(null); setN(k);
  };
  const press = (v: number | null) => {
    if (v == null) return;
    if (v !== next) { setOver(n - 1); void ctx.write("create", "brain_test_results", { test: "chimp", score: n - 1, unit: "numbers" }); return; }
    if (v === 1) setHidden(true);
    setCells((c) => c.map((x) => (x === v ? null : x)));
    if (v === n) start(n + 1); else setNext(v + 1);
  };
  if (!cells.length || over != null) return <button className={u.game} onClick={() => start(4)}>{over != null ? `Chimp test: ${over} numbers. Click to retry` : "Chimp test: click the numbers in order; they hide after the first. Click to start"}</button>;
  return <div className={u.chimp}>{cells.map((v, i) => <button key={i} data-on={v != null} onClick={() => press(v)}>{v != null && !hidden ? v : ""}</button>)}</div>;
}

const WORDS = "orbit lantern meadow crystal harbour velvet canyon ember quartz willow thunder saffron glacier pepper marble falcon nectar prism tundra cobalt ripple summit violet anchor ember lotus cipher amber delta mosaic".split(" ");
function pickWord(s: Set<string>) {
  if (s.size && Math.random() < 0.45) return [...s][rnd(s.size)];
  const fresh = WORDS.filter((w) => !s.has(w));
  return fresh[rnd(Math.max(1, fresh.length))] ?? [...s][0];
}
export function Verbal({ ctx }: { ctx: BlockCtx }) {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [word, setWord] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const nextWord = (s: Set<string>) => setWord(pickWord(s));
  const answer = (saidSeen: boolean) => {
    if (!word) return;
    const ok = saidSeen === seen.has(word);
    const s = new Set(seen); s.add(word); setSeen(s);
    if (ok) { setScore(score + 1); nextWord(s); }
    else if (lives <= 1) { setLives(0); setWord(null); void ctx.write("create", "brain_test_results", { test: "verbal", score, unit: "words" }); }
    else { setLives(lives - 1); nextWord(s); }
  };
  if (!word) return <button className={u.game} onClick={() => { setSeen(new Set()); setScore(0); setLives(3); nextWord(new Set()); }}>{lives === 0 ? `Verbal memory: ${score}. Click to retry` : "Verbal memory: say whether you've seen each word. Click to start"}</button>;
  return (
    <div className={u.game}>
      <div><div className="display">{word}</div><div className="label">score {score} · lives {lives}</div></div>
      <div className={u.row}><button className="pill" onClick={() => answer(true)}>Seen</button><button className="pill" data-active="true" onClick={() => answer(false)}>New</button></div>
    </div>
  );
}

export function Visual({ ctx }: { ctx: BlockCtx }) {
  const [lvl, setLvl] = useState(1);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [got, setGot] = useState<Set<number>>(new Set());
  const [show, setShow] = useState(false);
  const [lives, setLives] = useState(3);
  const [miss, setMiss] = useState(0);
  const size = lvl < 3 ? 3 : lvl < 6 ? 4 : 5;
  const start = (l: number) => {
    const sz = l < 3 ? 3 : l < 6 ? 4 : 5;
    setLit(new Set(shuffle(Array.from({ length: sz * sz }, (_, i) => i)).slice(0, l + 2))); setGot(new Set()); setMiss(0); setShow(true); setLvl(l);
    setTimeout(() => setShow(false), 1200);
  };
  const press = (i: number) => {
    if (show || got.has(i)) return;
    if (lit.has(i)) { const g = new Set(got); g.add(i); setGot(g); if (g.size === lit.size) setTimeout(() => start(lvl + 1), 400); }
    else if (miss >= 2) { if (lives <= 1) { setLives(0); setLit(new Set()); void ctx.write("create", "brain_test_results", { test: "visual", score: lvl - 1, unit: "level" }); } else { setLives(lives - 1); start(lvl); } }
    else setMiss(miss + 1);
  };
  if (!lit.size) return <button className={u.game} onClick={() => { setLives(3); start(1); }}>{lives === 0 ? `Visual memory: level ${lvl - 1}. Click to retry` : "Visual memory: remember the lit squares. Click to start"}</button>;
  return (
    <div className={u.seqWrap}>
      <div className={u.vgrid} style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}>
        {Array.from({ length: size * size }, (_, i) => <button key={i} data-lit={(show && lit.has(i)) || got.has(i)} onClick={() => press(i)} aria-label={`Square ${i + 1}`} />)}
      </div>
      <div className="label">Level {lvl} · lives {lives}</div>
    </div>
  );
}

const SUITS = ["♠", "♥", "♦", "♣"], RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const DECK = SUITS.flatMap((s) => RANKS.map((r) => r + s));
const dealCards = (n: number) => shuffle(DECK).slice(0, n);
const clock = () => performance.now();
/** Memory sports: memorise a run of cards, then recall them in order. */
export function CardMemory({ ctx }: { ctx: BlockCtx }) {
  const [n, setN] = useState(8);
  const [cards, setCards] = useState<string[]>([]);
  const [phase, setPhase] = useState<"idle" | "study" | "recall" | "done">("idle");
  const [i, setI] = useState(0);
  const [t0, setT0] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const [result, setResult] = useState("");
  const [studySecs, setStudySecs] = useState(0);
  const deck = DECK;
  const startDeck = () => { setCards(dealCards(n)); setI(0); setPicks([]); setT0(clock()); setPhase("study"); };
  if (phase === "idle" || phase === "done")
    return (
      <div className={u.game}>
        <div>
          <p>Memorise {n} cards in order, then recall them.</p>
          {result && <div className="label">{result}</div>}
          <div className={u.row} style={{ justifyContent: "center" }}>
            <select className={u.timerSel} value={n} onChange={(e) => setN(Number(e.target.value))}>{[8, 13, 20, 26, 52].map((k) => <option key={k} value={k}>{k} cards</option>)}</select>
            <button className="pill" data-active="true" onClick={() => startDeck()}>Start</button>
          </div>
        </div>
      </div>
    );
  if (phase === "study")
    return (
      <div className={u.game}>
        <div>
          <div className={u.card} data-red={/[♥♦]/.test(cards[i])}>{cards[i]}</div>
          <div className="label">{i + 1} / {cards.length}</div>
          <div className={u.row} style={{ justifyContent: "center" }}>
            <button className="pill" disabled={i === 0} onClick={() => setI(i - 1)}>‹</button>
            {i < cards.length - 1 ? <button className="pill" onClick={() => setI(i + 1)}>›</button> : <button className="pill" data-active="true" onClick={() => { setStudySecs(Math.round((clock() - t0) / 1000)); setPhase("recall"); }}>Recall</button>}
          </div>
        </div>
      </div>
    );
  return (
    <div className={u.cardRecall}>
      <div className="label">Card {picks.length + 1} of {cards.length}</div>
      <div className={u.cardGrid}>
        {deck.map((c) => <button key={c} data-red={/[♥♦]/.test(c)} disabled={picks.includes(c)} onClick={() => {
          const np = [...picks, c];
          setPicks(np);
          if (np.length === cards.length) {
            const correct = np.findIndex((x, k) => x !== cards[k]);
            const score = correct === -1 ? cards.length : correct;
            setResult(`${score}/${cards.length} in order · studied for ${studySecs}s`);
            void ctx.write("create", "memory_sessions", { kind: "cards", score, notes: `${cards.length} cards, ${studySecs}s study` });
            setPhase("done");
          }
        }}>{c}</button>)}
      </div>
    </div>
  );
}

/* ---------- habit streaks ---------- */
type Streak = { id: string; label: string; current: number; best: number; today: boolean; last14: boolean[] };
export function Streaks({ p }: { p: P }) {
  const { changes } = useApollo();
  const [list, setList] = useState<Streak[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/streaks").then(async (r) => (r.ok ? setList(await r.json()) : setErr("no data (database not connected)"))).catch(() => setErr("couldn't load")); }, [changes]);
  if (err) return <NoData>{err}</NoData>;
  if (!list) return null;
  const shown = p.habits ? list.filter((s) => (p.habits as string[]).includes(s.id)) : list;
  return (
    <ul className={u.streaks}>
      {shown.map((s) => (
        <li key={s.id} data-today={s.today}>
          <span>{s.label}</span>
          <b>{s.current}<small>d</small></b>
          <i>{s.last14.map((d, k) => <em key={k} data-on={d} />)}</i>
          <small>best {s.best}</small>
        </li>
      ))}
    </ul>
  );
}

/* ---------- exam countdown ---------- */
export function Countdown({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const rows = ((ctx.data?.rows ?? []) as Row[]).filter((r) => !p.kind || r.kind === p.kind).sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const [now, setNow] = useState(0);
  useEffect(() => { queueMicrotask(() => setNow(Date.now())); }, [rows.length]);
  if (ctx.data?.error) return <NoData>{ctx.data.error}</NoData>;
  if (!rows.length) return <NoData>No exams added yet. Add them on School → Timetable.</NoData>;
  if (!now) return null;
  const [first, ...rest] = rows;
  const days = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 864e5));
  return (
    <div className={u.countdown}>
      <div><b className="display">{days(first.at)}</b><span>days to <strong>{first.title}</strong><small>{new Date(first.at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</small></span></div>
      {rest.slice(0, p.limit ?? 4).map((r) => <p key={r.id}><span>{r.title}</span><b>{days(r.at)} d</b></p>)}
    </div>
  );
}
