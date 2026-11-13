"use client";
// School analysis ("path to A*"), school test entry with per-topic marks, and spec confidence (RAG).

import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import type { SubjectAnalysis } from "@/core/schoolAnalysis";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const field: React.CSSProperties = { height: 34, padding: "0 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" };
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics"];
const tone = (pct: number | null, target = 80) => (pct == null ? "var(--text-dim)" : pct >= target ? "var(--good)" : pct >= target - 10 ? "#f7c631" : "var(--danger)");

export function SchoolAnalysisBlock({ ctx }: { ctx: BlockCtx }) {
  const { changes, submit } = useApollo();
  const [a, setA] = useState<{ target: string; atTarget: number; subjects: SubjectAnalysis[]; revisionMinutes28: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { fetch("/api/school-analysis").then((r) => (r.ok ? r.json() : null)).then(setA).catch(() => {}); }, [changes, ctx.data]);
  if (!a) return <div className="label">Loading…</div>;
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={u.row}>
        <b style={{ fontSize: 18 }}>{a.atTarget}/{a.subjects.length} subjects at {a.target}</b>
        <span className="label">{a.revisionMinutes28} min revised in the last 28 days</span>
        <button className="pill" onClick={() => submit(`Using get_school_analysis, explain what my school stats say about my skill and my revision in each subject, and give me a concrete 2-week plan to close the gap to ${a.target}. Don't invent numbers.`, { thread: "school:coach" })}>Ask Apollo to coach me</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
        {a.subjects.map((s) => (
          <div key={s.subject} style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 6, borderTop: `3px solid ${tone(s.level)}` }}>
            <div className={u.row}><b style={{ flex: 1 }}>{s.subject}</b><span className="display" style={{ fontSize: 28, color: tone(s.level) }}>{s.grade ?? "–"}</span></div>
            <small className="label">{s.level == null ? "no marks yet" : `${s.level}% now · ${s.gapToTarget ? `${s.gapToTarget} pts to ${s.target}` : `at ${s.target}`}`}{s.trend != null ? ` · trend ${s.trend >= 0 ? "+" : ""}${s.trend}` : ""}</small>
            <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)", position: "relative" }}>
              <div style={{ width: `${Math.min(100, s.level ?? 0)}%`, height: "100%", borderRadius: 3, background: tone(s.level) }} />
              <i style={{ position: "absolute", left: "80%", top: -3, width: 2, height: 12, background: "var(--text)" }} title={`${s.target} line`} />
            </div>
            <small>Evidence: {s.evidence.tests} tests · {s.evidence.papers} papers · {s.evidence.questions} questions</small>
            <small>Revision: {s.revision.minutes28} min / 28 d ({s.revision.share}%) · flashcards {s.flashcards.retention ?? "–"}% recall · {s.flashcards.due} due</small>
            <small>Homework: {s.homework.open} open{s.homework.overdue ? `, ${s.homework.overdue} overdue` : ""}</small>
            {s.weakest.length > 0 && <small>Weakest: {s.weakest.slice(0, 3).map((t) => `${t.topic} ${t.pct}%`).join(" · ")}</small>}
            <button className="pill" onClick={() => setOpen(open === s.subject ? null : s.subject)}>{open === s.subject ? "Hide" : "Path to"} {s.target}</button>
            {open === s.subject && <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{s.actions.map((x) => <li key={x}>{x}</li>)}</ol>}
            {open === s.subject && s.topics.length > 0 && (
              <div style={{ display: "grid", gap: 3 }}>
                <span className="label">All topics (weakest first)</span>
                {s.topics.slice(0, 15).map((t) => (
                  <div key={t.topic} style={{ display: "grid", gridTemplateColumns: "1fr 70px 44px", gap: 6, alignItems: "center", fontSize: 12.5 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.topic}</span>
                    <i style={{ height: 6, borderRadius: 3, background: `linear-gradient(90deg, ${tone(t.pct)} ${t.pct}%, var(--surface-2) ${t.pct}%)` }} />
                    <b>{t.pct}%</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <small className="label">Level = recency-weighted average of school tests and past papers (questions count less). Grades use typical boundaries (A* ≈ 80%); real ones vary by board and year.</small>
    </div>
  );
}

/** Add a school test with marks per topic. */
export function SchoolTestForm({ ctx }: { ctx: BlockCtx }) {
  const [t, setT] = useState({ subject: "Maths", title: "", date: new Date().toISOString().slice(0, 10), score: "", total: "", grade: "", notes: "" });
  const [topics, setTopics] = useState<{ topic: string; marks: string; total: string }[]>([{ topic: "", marks: "", total: "" }]);
  const [msg, setMsg] = useState<string | null>(null);
  const sum = topics.reduce((a, x) => ({ m: a.m + (Number(x.marks) || 0), t: a.t + (Number(x.total) || 0) }), { m: 0, t: 0 });
  const save = async () => {
    const score = t.score === "" ? sum.m : Number(t.score), total = t.total === "" ? sum.t : Number(t.total);
    if (!t.title || !(total > 0)) return setMsg("Add a title and the marks (or topic marks).");
    await ctx.write("create", "school_tests", { subject: t.subject, title: t.title, date: t.date, score, total, grade: t.grade || null, notes: t.notes || null,
      topics: topics.filter((x) => x.topic && Number(x.total) > 0).map((x) => ({ topic: x.topic, marks: Number(x.marks) || 0, total: Number(x.total) })) });
    setMsg(`Saved: ${t.title} ${score}/${total} (${Math.round((score / total) * 100)}%).`);
    setT({ ...t, title: "", score: "", total: "", grade: "", notes: "" }); setTopics([{ topic: "", marks: "", total: "" }]);
    ctx.refresh?.();
  };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8 }}>
        <select style={field} value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })}>{SUBJ.map((x) => <option key={x}>{x}</option>)}</select>
        <input style={field} placeholder="Test name, e.g. Mechanics end of unit" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
        <input style={field} type="date" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} />
        <input style={field} type="number" placeholder={`Score${sum.t ? ` (${sum.m})` : ""}`} value={t.score} onChange={(e) => setT({ ...t, score: e.target.value })} />
        <input style={field} type="number" placeholder={`Out of${sum.t ? ` (${sum.t})` : ""}`} value={t.total} onChange={(e) => setT({ ...t, total: e.target.value })} />
        <input style={field} placeholder="Grade given (optional)" value={t.grade} onChange={(e) => setT({ ...t, grade: e.target.value })} />
      </div>
      <span className="label">Topics in the test (marks you got / marks available)</span>
      {topics.map((x, i) => (
        <div key={i} className={u.row}>
          <input style={{ ...field, flex: 1 }} placeholder="Topic, e.g. Projectiles" value={x.topic} onChange={(e) => setTopics(topics.map((y, j) => (j === i ? { ...y, topic: e.target.value } : y)))} />
          <input style={{ ...field, width: 70 }} type="number" placeholder="got" value={x.marks} onChange={(e) => setTopics(topics.map((y, j) => (j === i ? { ...y, marks: e.target.value } : y)))} />
          <input style={{ ...field, width: 70 }} type="number" placeholder="of" value={x.total} onChange={(e) => setTopics(topics.map((y, j) => (j === i ? { ...y, total: e.target.value } : y)))} />
          <button className="pill" onClick={() => setTopics(topics.length > 1 ? topics.filter((_, j) => j !== i) : topics)}>✕</button>
        </div>
      ))}
      <input style={field} placeholder="Notes: what went wrong, timing, careless errors…" value={t.notes} onChange={(e) => setT({ ...t, notes: e.target.value })} />
      <div className={u.row}>
        <button className="pill" onClick={() => setTopics([...topics, { topic: "", marks: "", total: "" }])}>+ Topic</button>
        <button className="pill" data-active="true" onClick={save}>Save test</button>
        {msg && <span className="label">{msg}</span>}
      </div>
    </div>
  );
}

/** Spec checklist with red/amber/green confidence per topic. */
export function SpecRag({ ctx }: { ctx: BlockCtx }) {
  const rows = (ctx.data?.rows ?? []) as Row[];
  const [subj, setSubj] = useState("");
  const list = rows.filter((r) => !subj || r.subject === subj);
  const counts = [1, 2, 3].map((c) => list.filter((r) => Number(r.confidence) === c).length);
  const set = async (r: Row, c: number) => { await ctx.write("update", "spec_topics", { confidence: c, last_reviewed: new Date().toISOString() }, r.id); };
  if (!rows.length) return <div className="label">Add your spec topics (School › Subjects, or ask Apollo to add a board&apos;s spec) to rate your confidence.</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row}>
        <select style={field} value={subj} onChange={(e) => setSubj(e.target.value)}><option value="">All subjects</option>{SUBJ.map((x) => <option key={x}>{x}</option>)}</select>
        <span className="label">🔴 {counts[0]} · 🟠 {counts[1]} · 🟢 {counts[2]} · unrated {list.length - counts[0] - counts[1] - counts[2]} · {list.length ? Math.round((counts[2] / list.length) * 100) : 0}% green</span>
      </div>
      <div style={{ display: "grid", gap: 3, maxHeight: 420, overflow: "auto" }}>
        {list.map((r) => (
          <div key={r.id} className={u.row} style={{ fontSize: 13 }}>
            <span style={{ flex: 1 }}>{r.code ? `${r.code} ` : ""}{r.title} <small className="label">{r.subject}</small></span>
            {[1, 2, 3].map((c) => (
              <button key={c} aria-label={["red", "amber", "green"][c - 1]} onClick={() => set(r, c)} style={{ width: 22, height: 22, borderRadius: "50%", border: "2px solid", borderColor: ["#e5484d", "#f5a524", "#30a46c"][c - 1], background: Number(r.confidence) === c ? ["#e5484d", "#f5a524", "#30a46c"][c - 1] : "transparent" }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
