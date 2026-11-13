"use client";
// Extra blocks: grade predictor, personal records, habits, book finish dates,
// chess opening stats, word of the day. All numbers are computed here from your rows.

import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const nowMs = () => Date.now();
const rowsOf = (ctx: BlockCtx) => (ctx.data?.rows ?? []) as Row[];
const Empty = ({ t }: { t: string }) => <div className="label">{t}</div>;
const td: React.CSSProperties = { padding: "5px 8px", borderBottom: "1px solid var(--border)", fontSize: 13, textAlign: "left" };

/* ---------- grade predictor ---------- */
// Rough A-level boundaries as % of total marks (they vary by board and year; shown as an estimate).
const BOUNDS: [string, number][] = [["A*", 80], ["A", 70], ["B", 60], ["C", 50], ["D", 40], ["E", 30]];
const gradeFor = (pct: number) => BOUNDS.find(([, b]) => pct >= b)?.[0] ?? "U";
export function GradePredictor({ ctx }: { ctx: BlockCtx }) {
  const rows = rowsOf(ctx).filter((r) => r.pct != null && r.subject);
  const by = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) m.set(r.subject, [...(m.get(r.subject) ?? []), r]);
    return [...m.entries()].map(([subject, rs]) => {
      const sorted = [...rs].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
      const recent = sorted.slice(-5);
      // recent papers count more (weights 1..n)
      const w = recent.reduce((a, _, i) => a + i + 1, 0);
      const avg = recent.reduce((a, r, i) => a + Number(r.pct) * (i + 1), 0) / w;
      const first = sorted.slice(0, Math.min(3, sorted.length)), last = sorted.slice(-Math.min(3, sorted.length));
      const trend = sorted.length >= 4 ? last.reduce((a, r) => a + Number(r.pct), 0) / last.length - first.reduce((a, r) => a + Number(r.pct), 0) / first.length : null;
      const next = BOUNDS.slice().reverse().find(([, b]) => b > avg);
      return { subject, n: sorted.length, avg: Math.round(avg * 10) / 10, grade: gradeFor(avg), trend, next };
    });
  }, [rows]);
  if (!by.length) return <Empty t="Log past papers to get a predicted grade per subject." />;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={td}>Subject</th><th style={td}>Predicted</th><th style={td}>Weighted avg</th><th style={td}>Trend</th><th style={td}>Next grade</th></tr></thead>
        <tbody>{by.map((x) => (
          <tr key={x.subject}>
            <td style={td}>{x.subject} <small className="label">({x.n} papers)</small></td>
            <td style={td}><b style={{ fontSize: 18 }}>{x.grade}</b></td>
            <td style={td}>{x.avg}%</td>
            <td style={{ ...td, color: x.trend == null ? undefined : x.trend >= 0 ? "var(--good)" : "var(--danger)" }}>{x.trend == null ? "—" : `${x.trend >= 0 ? "+" : ""}${x.trend.toFixed(1)} pts`}</td>
            <td style={td}>{x.next ? `${x.next[0]} needs +${(x.next[1] - x.avg).toFixed(1)}%` : "top grade"}</td>
          </tr>
        ))}</tbody>
      </table>
      <small className="label">Estimate from your last 5 papers (recent ones weigh more) against typical boundaries (A* 80, A 70, B 60…). Real boundaries vary by board and year.</small>
    </div>
  );
}

/* ---------- personal records / estimated 1RM ---------- */
const e1rm = (w: number, r: number) => (r <= 1 ? w : w * (1 + r / 30)); // Epley
export function PersonalRecords({ ctx }: { ctx: BlockCtx }) {
  const rows = rowsOf(ctx).filter((r) => r.exercise && Number(r.weight_kg) > 0 && Number(r.reps) > 0);
  const prs = useMemo(() => {
    const m = new Map<string, { best: Row; e: number; heaviest: Row; recentE: number; count: number }>();
    const cutoff = nowMs() - 28 * 864e5;
    for (const r of rows) {
      const e = e1rm(Number(r.weight_kg), Number(r.reps));
      const cur = m.get(r.exercise);
      if (!cur) { m.set(r.exercise, { best: r, e, heaviest: r, recentE: Date.parse(r.created_at) > cutoff ? e : 0, count: 1 }); continue; }
      cur.count++;
      if (e > cur.e) { cur.e = e; cur.best = r; }
      if (Number(r.weight_kg) > Number(cur.heaviest.weight_kg)) cur.heaviest = r;
      if (Date.parse(r.created_at) > cutoff) cur.recentE = Math.max(cur.recentE, e);
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [rows]);
  if (!prs.length) return <Empty t="Log sets with weight and reps to see your records." />;
  const d = (r: Row) => new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th style={td}>Exercise</th><th style={td}>Est. 1RM</th><th style={td}>Best set</th><th style={td}>Heaviest</th><th style={td}>Last 4 weeks</th></tr></thead>
      <tbody>{prs.map(([ex, p]) => (
        <tr key={ex}>
          <td style={td}>{ex}</td>
          <td style={td}><b>{p.e.toFixed(1)} kg</b></td>
          <td style={td}>{p.best.weight_kg} × {p.best.reps} <small className="label">{d(p.best)}</small></td>
          <td style={td}>{p.heaviest.weight_kg} kg <small className="label">{d(p.heaviest)}</small></td>
          <td style={td}>{p.recentE ? `${p.recentE.toFixed(1)} kg (${Math.round((p.recentE / p.e) * 100)}% of best)` : "—"}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/* ---------- habits ---------- */
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
export function Habits({ ctx }: { ctx: BlockCtx }) {
  const rows = rowsOf(ctx); // habit_logs (last ~120 days)
  const [habits, setHabits] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "habits", where: { archived: false }, limit: 50 }] }) })
      .then((r) => r.json()).then((j) => setHabits(j?.[0]?.rows ?? [])).catch(() => setHabits([]));
  }, [tick, ctx.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = Array.from({ length: 14 }, (_, i) => ymd(new Date(nowMs() - (13 - i) * 864e5)));
  const done = new Set(rows.map((r) => `${r.habit_id}|${String(r.day).slice(0, 10)}`));
  const toggle = async (h: Row, day: string) => {
    await fetch("/api/habits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ habit_id: h.id, habit: h.name, day }) });
    ctx.refresh?.();
  };
  const streak = (h: Row) => { let n = 0; for (let i = 0; i < 400; i++) { const d = ymd(new Date(nowMs() - i * 864e5)); if (done.has(`${h.id}|${d}`)) n++; else if (i > 0) break; } return n; };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse" }}>
          <thead><tr><th style={td}>Habit</th>{days.map((d) => <th key={d} style={{ ...td, textAlign: "center", fontWeight: 400 }}><small>{new Date(d).toLocaleDateString("en-GB", { weekday: "narrow" })}<br />{d.slice(8)}</small></th>)}<th style={td}>Streak</th><th style={td}>This week</th></tr></thead>
          <tbody>{(habits ?? []).map((h) => {
            const week = days.slice(-7).filter((d) => done.has(`${h.id}|${d}`)).length;
            return (
              <tr key={h.id}>
                <td style={td}>{h.name}</td>
                {days.map((d) => (
                  <td key={d} style={{ ...td, textAlign: "center" }}>
                    <button aria-label={`${h.name} ${d}`} onClick={() => toggle(h, d)} style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid var(--border)", background: done.has(`${h.id}|${d}`) ? "var(--accent)" : "transparent" }} />
                  </td>
                ))}
                <td style={td}><b>{streak(h)}</b> d</td>
                <td style={td}>{week}/{h.target_per_week}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {habits && !habits.length && <Empty t="No habits yet. Add one below." />}
      <div className={u.row}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New habit, e.g. Read 20 pages" style={{ flex: 1, height: 34, padding: "0 10px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" }} />
        <button className="pill" data-active="true" disabled={!name.trim()} onClick={async () => { await ctx.write("create", "habits", { name: name.trim(), target_per_week: 7, archived: false }); setName(""); setTick((t) => t + 1); }}>Add habit</button>
      </div>
    </div>
  );
}

/* ---------- book finish dates ---------- */
export function BookEta({ ctx }: { ctx: BlockCtx }) {
  const logs = rowsOf(ctx); // reading_logs (60 days)
  const [books, setBooks] = useState<Row[] | null>(null);
  useEffect(() => {
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "books", where: { status: "reading" }, limit: 20 }] }) })
      .then((r) => r.json()).then((j) => setBooks(j?.[0]?.rows ?? [])).catch(() => setBooks([]));
  }, [ctx.data]);
  const recent = logs.filter((l) => Date.parse(l.created_at) > nowMs() - 14 * 864e5);
  const pace = recent.reduce((a, l) => a + Number(l.pages || 0), 0) / 14;
  if (!books) return null;
  if (!books.length) return <Empty t="Mark a book as 'reading' to see when you'll finish it." />;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="label">Your pace, last 14 days: {pace.toFixed(1)} pages/day</div>
      {books.map((b) => {
        const read = logs.filter((l) => l.book_id === b.id || l.book === b.title).reduce((a, l) => a + Number(l.pages || 0), 0);
        const left = Math.max(0, Number(b.pages || 0) - read);
        const bookPace = logs.filter((l) => (l.book_id === b.id || l.book === b.title) && Date.parse(l.created_at) > nowMs() - 14 * 864e5).reduce((a, l) => a + Number(l.pages || 0), 0) / 14 || pace;
        const daysLeft = bookPace > 0 ? Math.ceil(left / bookPace) : null;
        const pct = b.pages ? Math.min(100, Math.round((read / Number(b.pages)) * 100)) : null;
        return (
          <div key={b.id} style={{ display: "grid", gap: 4 }}>
            <div className={u.row}><b style={{ flex: 1 }}>{b.title}</b><span className="label">{b.pages ? `${read}/${b.pages} pages` : "add the page count to estimate"}</span></div>
            {pct != null && <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: "var(--accent)" }} /></div>}
            <small className="label">{!b.pages ? "" : left === 0 ? "Finished?" : daysLeft == null ? "Log some reading to estimate" : `About ${daysLeft} day${daysLeft === 1 ? "" : "s"} left · finish around ${new Date(nowMs() + daysLeft * 864e5).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}</small>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- chess opening stats ---------- */
export function ChessOpenings({ ctx }: { ctx: BlockCtx }) {
  const games = rowsOf(ctx).filter((g) => g.pgn);
  const stats = useMemo(() => {
    const m = new Map<string, { w: number; d: number; l: number; color: string }>();
    for (const g of games) {
      const eco = /\[ECOUrl "[^"]*\/openings\/([^"]+)"\]/.exec(g.pgn)?.[1]?.replace(/-/g, " ").replace(/\.\.\.|\d+\.\s?/g, "").trim();
      let name = eco ? eco.split(" ").slice(0, 4).join(" ") : null;
      if (!name) {
        try { const c = new Chess(); c.loadPgn(g.pgn); name = c.history().slice(0, 4).join(" "); } catch { continue; }
      }
      const k = `${g.color === "black" ? "Black" : "White"} · ${name}`;
      const v = m.get(k) ?? { w: 0, d: 0, l: 0, color: g.color };
      if (g.result === "win") v.w++; else if (g.result === "draw") v.d++; else v.l++;
      m.set(k, v);
    }
    return [...m.entries()].map(([k, v]) => ({ k, ...v, n: v.w + v.d + v.l, score: Math.round(((v.w + v.d / 2) / (v.w + v.d + v.l)) * 100) })).filter((x) => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 15);
  }, [games]);
  if (!stats.length) return <Empty t="Play or sync a few games to see how you score with each opening." />;
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead><tr><th style={td}>Opening</th><th style={td}>Games</th><th style={td}>W / D / L</th><th style={td}>Score</th></tr></thead>
      <tbody>{stats.map((s) => (
        <tr key={s.k}><td style={td}>{s.k}</td><td style={td}>{s.n}</td><td style={td}>{s.w} / {s.d} / {s.l}</td>
          <td style={{ ...td, color: s.score >= 55 ? "var(--good)" : s.score < 45 ? "var(--danger)" : undefined }}><b>{s.score}%</b></td></tr>
      ))}</tbody>
    </table>
  );
}

/* ---------- word of the day ---------- */
export function WordOfDay({ ctx }: { ctx: BlockCtx }) {
  const cards = rowsOf(ctx).filter((c) => /mandarin|spanish|french|english|chinese/i.test(c.deck ?? ""));
  const [show, setShow] = useState(false);
  if (!cards.length) return <Empty t="Add language flashcards to get a word of the day." />;
  const day = Math.floor(nowMs() / 864e5);
  const c = cards[day % cards.length];
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <small className="label">{c.deck}</small>
      <div className="display" style={{ fontSize: 30 }}>{c.front}</div>
      {show ? <div>{c.back}</div> : <button className="pill" onClick={() => setShow(true)}>Show meaning</button>}
    </div>
  );
}
