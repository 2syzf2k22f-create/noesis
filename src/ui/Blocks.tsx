"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { QueryResult, Series } from "@/core/query";
import type { Block } from "./spec";
import u from "./ui.module.css";
import { useOptions } from "./useOptions";
import { AskBlock, BrainGame, GeoQuiz, Review, ScoresBlock, SyncBlock } from "./Blocks2";
import { Agenda, CardMemory, Countdown, InboxList, Insights, ScoreHistory, Streaks, Tile, Timetable } from "./Blocks3";
import { QuestionBank } from "./QuestionBank";
import { AnalysisBoard, GameReview, OpeningTrainer, Puzzles } from "@/chess/ChessBlocks";
import { DeepStats } from "./DeepStats";
import { Benchmark } from "./Benchmark";
import { PokerTable } from "@/poker/PokerTable";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>;
export type BlockCtx = { data?: QueryResult; write: (op: "create" | "update" | "delete", table: string, data?: Row, id?: string) => Promise<void>; refresh?: () => void };

const fmt = (n: number | null | undefined, unit?: string) =>
  n == null || Number.isNaN(n) ? "no data" : `${Math.abs(n) >= 10000 ? `${(n / 1000).toFixed(1)}k` : Number.isInteger(n) ? n : n.toFixed(1)}${unit ? ` ${unit}` : ""}`;
const NoData = () => <div className={u.nodata}>no data</div>;
const seriesOf = (d?: QueryResult): Series | null => d?.series ?? (d?.rows && d.rows.length ? null : null);
const valueOf = (d?: QueryResult) => d?.value ?? (d?.series ? d.series.reduce((a, s) => a + s.value, 0) : d?.rows ? d.rows.length : null);
const nice = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const cell = (v: unknown) => {
  if (v == null || v === "") return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (typeof v === "object") return JSON.stringify(v).slice(0, 40);
  return String(v);
};

/* ---------- charts ---------- */

function path(vals: number[], w: number, h: number, pad = 4) {
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const x = (i: number) => (vals.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (vals.length - 1));
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  return { d: vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" "), x, y };
}

export function Spark({ series, area, h = 56, markers }: { series: Series; area?: boolean; h?: number; markers?: boolean }) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (!series.length) return <NoData />;
  const w = 300, vals = series.map((s) => s.value);
  const { d, x, y } = path(vals, w, h);
  return (
    <svg className={u.chart} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h }}>
      <defs>
        <linearGradient id={id} x1="0" x2="1"><stop offset="0" stopColor="var(--chart-1)" /><stop offset="1" stopColor="var(--chart-2)" /></linearGradient>
        <linearGradient id={`${id}f`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--chart-1)" stopOpacity=".28" /><stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" /></linearGradient>
      </defs>
      {area && <path d={`${d} L${x(vals.length - 1)},${h} L${x(0)},${h} Z`} fill={`url(#${id}f)`} />}
      <path d={d} fill="none" stroke={`url(#${id})`} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {markers && vals.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="var(--chart-1)" vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

export function Bars({ series, h = 140 }: { series: Series; h?: number }) {
  if (!series.length) return <NoData />;
  const max = Math.max(...series.map((s) => s.value), 1);
  return (
    <div className={u.bars} style={{ height: h }}>
      {series.map((s) => (
        <div key={s.label} className={u.barCol} title={`${s.label}: ${fmt(s.value)}`}>
          <i style={{ height: `${(s.value / max) * 100}%` }} />
          <span>{s.label.length === 10 ? s.label.slice(8) : s.label.slice(0, 6)}</span>
        </div>
      ))}
    </div>
  );
}

export function Ring({ value, goal, label, unit, plain }: { value: number | null; goal?: number; label?: string; unit?: string; plain?: boolean }) {
  if (value == null) return <NoData />;
  const pct = goal ? Math.min(1, value / goal) : Math.min(1, value / 100);
  const r = 42, c = 2 * Math.PI * r;
  return (
    <div className={u.ring}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className={u.ringTrack} />
        <circle cx="50" cy="50" r={r} className={u.ringVal} strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      {plain || !goal ? (
        <div><b>{Math.round(pct * 100)}%</b>{label && <small>{label}</small>}</div>
      ) : (
        <div><b>{fmt(value, unit)}</b><small>{Math.round(pct * 100)}% of {fmt(goal, unit)}</small>{label && <small>{label}</small>}</div>
      )}
    </div>
  );
}

function Donut({ series }: { series: Series }) {
  const total = series.reduce((a, s) => a + s.value, 0);
  if (!total) return <NoData />;
  const r = 38, c = 2 * Math.PI * r;
  const lens = series.map((s) => (s.value / total) * c);
  const offs = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className={u.donut}>
      <svg viewBox="0 0 100 100">
        {series.map((s, i) => {
          return <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={`var(--chart-${(i % 4) + 1})`} strokeWidth="12" strokeDasharray={`${Math.max(0, lens[i] - 1.5)} ${c}`} strokeDashoffset={-offs[i]} transform="rotate(-90 50 50)" />;
        })}
      </svg>
      <ul>{series.map((s, i) => <li key={s.label}><i style={{ background: `var(--chart-${(i % 4) + 1})` }} />{s.label}<b>{Math.round((s.value / total) * 100)}%</b></li>)}</ul>
    </div>
  );
}

function Heatmap({ series }: { series: Series }) {
  if (!series.length) return <NoData />;
  const max = Math.max(...series.map((s) => s.value), 1);
  return (
    <div className={u.heat} style={{ gridTemplateColumns: `repeat(${Math.min(series.length, 14)}, 1fr)` }}>
      {series.map((s) => <i key={s.label} title={`${s.label}: ${fmt(s.value)}`} style={{ opacity: s.value ? 0.18 + 0.82 * (s.value / max) : 0.07 }} />)}
    </div>
  );
}

/* ---------- interactive ---------- */

type Field = { name: string; label?: string; type?: "text" | "number" | "date" | "datetime-local" | "time" | "select" | "textarea" | "checkbox"; options?: string[]; optionsFrom?: { table: string; field: string }; required?: boolean };

function SelectField({ f }: { f: Field }) {
  const opts = useOptions(f.optionsFrom, f.options ?? []);
  return <select name={f.name} required={f.required}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
}

function Form({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const fields: Field[] = p.fields ?? [];
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  if (!p.table || !fields.length) return <NoData />;
  return (
    <form
      className={u.form}
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const data: Row = { ...(p.defaults ?? {}) };
        for (const f of fields) {
          const v = fd.get(f.name);
          if (f.type === "checkbox") data[f.name] = v === "on";
          else if (v === null || v === "") continue;
          else data[f.name] = f.type === "number" ? Number(v) : f.type === "datetime-local" ? new Date(String(v)).toISOString() : String(v);
        }
        setBusy(true);
        await ctx.write("create", p.table, data);
        setBusy(false);
        setDone(true);
        (e.target as HTMLFormElement).reset();
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {fields.map((f) => (
        <label key={f.name} data-wide={f.type === "textarea"}>
          <span className="label">{f.label ?? nice(f.name)}</span>
          {f.type === "select" ? (
            <SelectField f={f} />
          ) : f.type === "textarea" ? (
            <textarea name={f.name} rows={3} required={f.required} />
          ) : (
            <input name={f.name} type={f.type ?? "text"} step={f.type === "number" ? "any" : undefined} required={f.required}
              defaultValue={f.type === "date" ? new Date().toISOString().slice(0, 10) : undefined} />
          )}
        </label>
      ))}
      <button className="pill" data-active="true" disabled={busy}>{done ? "Saved" : (p.submit ?? "Add")}</button>
    </form>
  );
}

function List({ p, rows, ctx, table }: { p: P; rows: Row[]; ctx: BlockCtx; table?: string }) {
  if (!rows.length) return <NoData />;
  const prim = p.primary ?? Object.keys(rows[0]).find((k) => ["title", "name", "label"].includes(k)) ?? "id";
  const act = p.action as { label: string; op: "create" | "update"; table?: string; data?: P; map?: Record<string, string> } | undefined;
  return (
    <ul className={u.list}>
      {rows.map((r) => (
        <li key={r.id}>
          <div>
            {p.link ? (
              <a href={String(p.link).replace(/\{(\w+)\}/g, (_: string, k: string) => encodeURIComponent(String(r[k] ?? "")))} target={String(p.link).startsWith("/") ? undefined : "_blank"} rel="noreferrer">{cell(r[prim])}</a>
            ) : <span>{cell(r[prim])}</span>}
            {p.secondary && <small>{([] as string[]).concat(p.secondary).map((k) => cell(r[k])).filter((x) => x !== "—").join(" · ")}</small>}
          </div>
          {act && (
            <button className={u.rowBtn} onClick={() => {
              const data: Row = { ...(act.data ?? {}) };
              for (const [k, src] of Object.entries(act.map ?? {})) data[k] = src.startsWith("$") ? r[src.slice(1)] : src;
              for (const [k, v] of Object.entries(data)) if (v === "$now") data[k] = new Date().toISOString();
              return act.op === "update" ? ctx.write("update", table!, data, r.id) : ctx.write("create", act.table ?? table!, data);
            }}>{act.label}</button>
          )}
        </li>
      ))}
    </ul>
  );
}

function Table({ p, rows }: { p: P; rows: Row[] }) {
  if (!rows.length) return <NoData />;
  const cols: string[] = p.columns ?? Object.keys(rows[0]).filter((k) => !["id", "deleted_at", "updated_at"].includes(k)).slice(0, 5);
  return (
    <div className={u.tableWrap}>
      <table className={u.table}>
        <thead><tr>{cols.map((c) => <th key={c} className="label">{nice(c)}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id}>{cols.map((c) => <td key={c}>{cell(r[c])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Kanban({ p, rows, ctx, table }: { p: P; rows: Row[]; ctx: BlockCtx; table?: string }) {
  const field = p.statusField ?? "status";
  const cols: string[] = p.columns ?? [...new Set(rows.map((r) => String(r[field] ?? "")))];
  const prim = p.primary ?? "name";
  return (
    <div className={u.kanban} style={{ gridTemplateColumns: `repeat(${cols.length || 1}, minmax(140px, 1fr))` }}>
      {cols.map((c, ci) => (
        <div key={c}>
          <div className="label">{c}</div>
          {rows.filter((r) => String(r[field]) === c).map((r) => (
            <div key={r.id} className={u.card}>
              {p.link ? (
              <a href={String(p.link).replace(/\{(\w+)\}/g, (_: string, k: string) => encodeURIComponent(String(r[k] ?? "")))} target={String(p.link).startsWith("/") ? undefined : "_blank"} rel="noreferrer">{cell(r[prim])}</a>
            ) : <span>{cell(r[prim])}</span>}
              <span className={u.moves}>
                {ci > 0 && <button aria-label="Move left" onClick={() => ctx.write("update", table!, { [field]: cols[ci - 1] }, r.id)}>‹</button>}
                {ci < cols.length - 1 && <button aria-label="Move right" onClick={() => ctx.write("update", table!, { [field]: cols[ci + 1] }, r.id)}>›</button>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function Timer({ p, ctx }: { p: P; ctx: BlockCtx }) {
  const [mins, setMins] = useState<number>(p.minutes ?? 25);
  const [subject, setSubject] = useState<string>((p.options ?? [])[0] ?? "");
  const total = Math.round(mins * 60);
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  const started = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((l) => {
      if (l <= 1) {
        setRunning(false);
        if (p.logTo) void ctx.write("create", p.logTo, { minutes: Math.round(total / 60), label: p.label ?? null, subject: subject || null, ...(p.defaults ?? {}) });
        return 0;
      }
      return l - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [running, p.logTo, p.label, p.defaults, total, ctx, subject]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  return (
    <div className={u.timer}>
      <Ring value={total - left} goal={total} plain />
      <div className="display">{mm}:{ss}</div>
      <div className={u.row}>
        <button className="pill" data-active={!running} onClick={() => { started.current ??= Date.now(); setRunning((r) => !r); }}>{running ? "Pause" : left === total ? "Start" : "Resume"}</button>
        <button className="pill" onClick={() => { setRunning(false); setLeft(total); }}>Reset</button>
        {p.logTo && left < total - 59 && left > 0 && (
          <button className="pill" onClick={() => {
            setRunning(false);
            void ctx.write("create", p.logTo, { minutes: Math.round((total - left) / 60), label: p.label ?? null, subject: subject || null, ...(p.defaults ?? {}) });
            setLeft(total);
          }}>Stop &amp; log {Math.round((total - left) / 60)} min</button>
        )}
      </div>
      {(p.options || p.choices) && (
        <div className={u.row}>
          {p.options && <select className={u.timerSel} value={subject} disabled={running} onChange={(e) => setSubject(e.target.value)}>{p.options.map((o: string) => <option key={o}>{o}</option>)}</select>}
          {p.choices && <select className={u.timerSel} value={mins} disabled={running} onChange={(e) => { setMins(Number(e.target.value)); setLeft(Number(e.target.value) * 60); }}>{p.choices.map((m: number) => <option key={m} value={m}>{m} min</option>)}</select>}
        </div>
      )}
    </div>
  );
}

function Flashcards({ p, rows }: { p: P; rows: Row[] }) {
  const cards: { front: string; back: string }[] = p.cards ?? rows.map((r) => ({ front: r[p.frontField ?? "front"], back: r[p.backField ?? "back"] }));
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  if (!cards.length) return <NoData />;
  const c = cards[i % cards.length];
  return (
    <div className={u.flash}>
      <button className={u.flashCard} data-flip={flip} onClick={() => setFlip((f) => !f)}>
        <span>{flip ? c.back : c.front}</span>
        <small className="label">{flip ? "answer" : "tap to flip"} · {i % cards.length + 1}/{cards.length}</small>
      </button>
      <div className={u.row}>
        <button className="pill" onClick={() => { setFlip(false); setI((n) => (n - 1 + cards.length) % cards.length); }}>Back</button>
        <button className="pill" data-active="true" onClick={() => { setFlip(false); setI((n) => n + 1); }}>Next</button>
      </div>
    </div>
  );
}

function Quiz({ p }: { p: P }) {
  const qs: { q: string; choices: string[]; answer: number | string }[] = p.questions ?? [];
  const [picked, setPicked] = useState<Record<number, number>>({});
  if (!qs.length) return <NoData />;
  const correct = (i: number) => (typeof qs[i].answer === "number" ? qs[i].answer : qs[i].choices.indexOf(String(qs[i].answer)));
  const score = Object.entries(picked).filter(([i, c]) => correct(Number(i)) === c).length;
  return (
    <div className={u.quiz}>
      {qs.map((q, i) => (
        <div key={i}>
          <p>{i + 1}. {q.q}</p>
          <div className={u.choices}>
            {q.choices.map((c, ci) => (
              <button key={ci} disabled={picked[i] !== undefined}
                data-state={picked[i] === undefined ? undefined : ci === correct(i) ? "right" : picked[i] === ci ? "wrong" : undefined}
                onClick={() => setPicked((p0) => ({ ...p0, [i]: ci }))}>{c}</button>
            ))}
          </div>
        </div>
      ))}
      <div className="label">Score {score} / {qs.length}{Object.keys(picked).length < qs.length ? " so far" : ""}</div>
    </div>
  );
}

function Media({ p }: { p: P }) {
  const src = String(p.src ?? "");
  if (!src) return <NoData />;
  const yt = /(?:youtu\.be\/|v=)([\w-]{11})/.exec(src)?.[1];
  if (p.kind === "youtube" || yt) return <iframe className={u.media} src={`https://www.youtube-nocookie.com/embed/${yt ?? src}`} allow="encrypted-media; picture-in-picture" allowFullScreen title={p.title ?? "Video"} />;
  if (p.kind === "video") return <video className={u.media} src={src} controls />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={u.media} src={src} alt={p.alt ?? ""} />;
}

function Wave() {
  return (
    <svg className={u.wave} viewBox="0 0 400 80" preserveAspectRatio="none" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <path key={i} d={`M0 40 C 60 ${40 - 30 + i * 2}, 120 ${40 + 30 - i * 2}, 200 40 S 340 ${40 - 24 + i}, 400 40`}
          fill="none" stroke={`var(--chart-${(i % 2) + 1})`} strokeOpacity={0.15 + i * 0.04} strokeWidth="1" style={{ animationDelay: `${-i * 0.35}s` }} />
      ))}
    </svg>
  );
}

/** Untrusted HTML from Apollo: sandboxed (scripts, no same-origin), no network (CSP). */
function Custom({ p, data }: { p: P; data?: QueryResult }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(Number(p.height) || 220);
  const vars = useMemo(() => {
    if (typeof window === "undefined") return "";
    const cs = getComputedStyle(document.documentElement);
    return ["--bg", "--surface", "--surface-2", "--border", "--text", "--text-dim", "--accent", "--accent-2", "--chart-1", "--chart-2", "--chart-3", "--chart-4", "--radius-sm"]
      .map((k) => `${k}:${cs.getPropertyValue(k)};`).join("");
  }, []);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:">
<style>:root{${vars}}html,body{margin:0;background:transparent;color:var(--text);font:14px system-ui,sans-serif}</style>
<script>window.addEventListener("message",e=>{if(e.data&&e.data.type==="noesis:data"){window.noesisData=e.data;window.dispatchEvent(new CustomEvent("noesis-data",{detail:e.data}))}});
new ResizeObserver(()=>parent.postMessage({type:"noesis:height",h:document.documentElement.scrollHeight},"*")).observe(document.documentElement);</script>
</head><body>${String(p.html ?? "")}</body></html>`;
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      if (e.data?.type === "noesis:height") setH(Math.min(900, Math.max(60, Number(e.data.h) || 0)));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const send = () => ref.current?.contentWindow?.postMessage({ type: "noesis:data", rows: data?.rows ?? [], value: data?.value ?? null, series: data?.series ?? [] }, "*");
  useEffect(send, [data]);
  return <iframe ref={ref} className={u.custom} sandbox="allow-scripts" srcDoc={doc} style={{ height: h }} onLoad={send} title={p.title ?? "Custom widget"} />;
}

function Markdown({ text }: { text: string }) {
  // tiny, safe subset: paragraphs, "- " lists, **bold**, *italic*, `code`. No raw HTML.
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((t, i) =>
    t.startsWith("**") ? <b key={i}>{t.slice(2, -2)}</b> : t.startsWith("`") ? <code key={i}>{t.slice(1, -1)}</code> : t.startsWith("*") && t.length > 2 ? <em key={i}>{t.slice(1, -1)}</em> : t);
  return (
    <div className={u.md}>
      {String(text).split(/\n{2,}/).map((para, i) =>
        /^\s*[-•]\s/m.test(para)
          ? <ul key={i}>{para.split("\n").filter(Boolean).map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-•]\s/, ""))}</li>)}</ul>
          : <p key={i}>{inline(para)}</p>)}
    </div>
  );
}

/* ---------- dispatcher ---------- */

export function BlockView({ block, ctx }: { block: Block; ctx: BlockCtx }) {
  const p: P = block.props ?? {};
  const d = ctx.data;
  if (d?.error) return <div className={u.nodata}>{d.error}</div>;
  const rows = d?.rows ?? [];
  const series = seriesOf(d) ?? [];
  const table = block.bind?.table ?? p.table;
  switch (block.type) {
    case "heading": return <h2 className={`display ${u.heading}`}>{p.text ?? block.title}</h2>;
    case "text": return <Markdown text={p.text ?? ""} />;
    case "stat": {
      const v = block.bind ? valueOf(d) : (p.value ?? null);
      return (
        <div className={u.stat}>
          <div className="display">{fmt(v, p.unit)}</div>
          {p.goal != null && v != null && <small>of {fmt(p.goal, p.unit)} goal</small>}
          {series.length > 1 && <Spark series={series} area h={40} />}
        </div>
      );
    }
    case "sparkline": return <Spark series={series} />;
    case "line": return <Spark series={series} h={150} markers />;
    case "area": return <Spark series={series} area h={150} />;
    case "bar": return <Bars series={series} />;
    case "ring": return <Ring value={valueOf(d)} goal={p.goal} label={p.label} unit={p.unit} />;
    case "donut": return <Donut series={series} />;
    case "heatmap": return <Heatmap series={series} />;
    case "table": return <Table p={p} rows={rows} />;
    case "list": return <List p={p} rows={rows} ctx={ctx} table={table} />;
    case "form": return <Form p={p} ctx={ctx} />;
    case "kanban": return <Kanban p={p} rows={rows} ctx={ctx} table={table} />;
    case "timer": return <Timer p={p} ctx={ctx} />;
    case "flashcards": return <Flashcards p={p} rows={rows} />;
    case "quiz": return <Quiz p={p} />;
    case "media": return <Media p={p} />;
    case "wave": return <Wave />;
    case "custom": return <Custom p={p} data={d} />;
    case "review": return <Review p={p} />;
    case "ask": return <AskBlock p={p} />;
    case "scores": return <ScoresBlock p={p} ctx={ctx} />;
    case "brain": return <BrainGame p={p} ctx={ctx} />;
    case "geo": return <GeoQuiz p={p} ctx={ctx} />;
    case "sync": return <SyncBlock p={p} ctx={ctx} />;
    case "timetable": return <Timetable p={p} ctx={ctx} />;
    case "agenda": return <Agenda p={p} />;
    case "tile": return <Tile p={p} ctx={ctx} />;
    case "insights": return <Insights />;
    case "history": return <ScoreHistory />;
    case "inbox": return <InboxList p={p} ctx={ctx} />;
    case "cards": return <CardMemory ctx={ctx} />;
    case "streaks": return <Streaks p={p} />;
    case "countdown": return <Countdown p={p} ctx={ctx} />;
    case "chessboard": return <AnalysisBoard ctx={ctx} p={p} />;
    case "openings": return <OpeningTrainer ctx={ctx} />;
    case "puzzles": return <Puzzles ctx={ctx} />;
    case "gamereview": return <GameReview ctx={ctx} p={p} />;
    case "questionbank": return <QuestionBank ctx={ctx} />;
    case "deepstats": return <DeepStats p={p} />;
    case "benchmark": return <Benchmark ctx={ctx} p={p} />;
    case "poker": return <PokerTable ctx={ctx} />;
  }
}
