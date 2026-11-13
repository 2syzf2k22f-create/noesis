"use client";
// Question bank: past-paper and generated exam questions with mark schemes. Practise one at a
// time or sit a timed test, self-mark against the mark scheme or have Apollo mark it.
// Every attempt is stored, so scores by topic/subtopic are always available.

import { useEffect, useMemo, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { useScreenContext } from "@/shell/screen";
import type { BlockCtx } from "./Blocks";
import s from "./qbank.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const SUBJECTS = ["Maths", "Further Maths", "Physics", "Economics"];
async function rec(op: "create" | "update", table: string, data: Record<string, unknown>, id?: string): Promise<Row | null> {
  return fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, table, data, id }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
}
const nowMs = () => Date.now();
const pct = (m: number, t: number) => (t ? Math.round((m / t) * 1000) / 10 : 0);
const shuffle = <T,>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

type Run = { mode: "practice" | "test"; qs: Row[]; i: number; answers: Record<string, string>; marks: Record<string, number>; revealed: boolean; testId: string | null; started: number; limit: number; done: boolean; attemptIds: Record<string, string> };

export function QuestionBank({ ctx }: { ctx: BlockCtx }) {
  const { submit, changes } = useApollo();
  const [qs, setQs] = useState<Row[]>([]);
  const [atts, setAtts] = useState<Row[]>([]);
  const [f, setF] = useState({ subject: "", topic: "", subtopic: "", source: "" });
  const [run, setRun] = useState<Run | null>(null);
  const [gen, setGen] = useState({ n: 5, style: "generated" });
  const [now, setNow] = useState(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "questions", limit: 500 }, { table: "question_attempts", limit: 500 }] }) }).then((r) => r.json()),
    ]).then(([j]) => { if (live && Array.isArray(j)) { setQs((j[0]?.rows ?? []).filter((q: Row) => !q.deleted_at)); setAtts(j[1]?.rows ?? []); } }).catch(() => {});
    return () => { live = false; };
  }, [changes, tick]);
  useEffect(() => { if (!run || run.mode !== "test" || run.done) return; const id = setInterval(() => setNow(nowMs()), 1000); return () => clearInterval(id); }, [run]);

  const topics = useMemo(() => [...new Set(qs.filter((q) => !f.subject || q.subject === f.subject).map((q) => q.topic).filter(Boolean))].sort(), [qs, f.subject]);
  const subtopics = useMemo(() => [...new Set(qs.filter((q) => (!f.subject || q.subject === f.subject) && (!f.topic || q.topic === f.topic)).map((q) => q.subtopic).filter(Boolean))].sort(), [qs, f.subject, f.topic]);
  const pool = qs.filter((q) => (!f.subject || q.subject === f.subject) && (!f.topic || q.topic === f.topic) && (!f.subtopic || q.subtopic === f.subtopic) && (!f.source || q.source === f.source));
  const byQ = useMemo(() => { const m = new Map<string, Row[]>(); for (const a of atts) if (a.question_id) m.set(a.question_id, [...(m.get(a.question_id) ?? []), a]); return m; }, [atts]);
  // stats per topic for the current subject filter
  const stats = useMemo(() => {
    const m = new Map<string, { marks: number; total: number; n: number }>();
    for (const a of atts) {
      if (f.subject && a.subject !== f.subject) continue;
      if (a.marks == null) continue;
      const k = `${a.subject ?? "?"} · ${a.topic ?? "general"}${a.subtopic ? ` › ${a.subtopic}` : ""}`;
      const v = m.get(k) ?? { marks: 0, total: 0, n: 0 };
      v.marks += Number(a.marks); v.total += Number(a.total) || 0; v.n++;
      m.set(k, v);
    }
    return [...m.entries()].map(([k, v]) => ({ k, ...v, pct: pct(v.marks, v.total) })).sort((a, b) => a.pct - b.pct);
  }, [atts, f.subject]);
  const overall = stats.reduce((a, x) => ({ m: a.m + x.marks, t: a.t + x.total }), { m: 0, t: 0 });

  const cur = run ? run.qs[run.i] : null;
  useScreenContext("question", cur ? `Question bank: ${cur.subject} ${cur.topic ?? ""} ${cur.subtopic ?? ""} [${cur.marks} marks] ${cur.question}${run?.revealed ? `\nMark scheme: ${cur.mark_scheme ?? "none"}\nReg's answer: ${run.answers[cur.id] ?? ""}` : ""}` : null);

  const mistakes = pool.filter((q) => { const a = byQ.get(q.id); const last = a?.[0]; return last && last.pct != null && Number(last.pct) < 60; });
  const start = async (mode: "practice" | "test", n: number, only?: Row[]) => {
    // weakest first in practice: unattempted, then lowest-scoring
    const score = (q: Row) => { const a = byQ.get(q.id); if (!a?.length) return -1; return a.reduce((x, y) => x + (Number(y.pct) || 0), 0) / a.length; };
    const chosen = only ? shuffle(only).slice(0, n) : mode === "practice" ? shuffle(pool).sort((a, b) => score(a) - score(b)).slice(0, n) : shuffle(pool).slice(0, n);
    if (!chosen.length) return;
    let testId: string | null = null;
    const total = chosen.reduce((a, q) => a + Number(q.marks), 0);
    if (mode === "test") testId = (await rec("create", "tests", { title: `${f.subject || "Mixed"} ${f.topic || ""} test`.trim(), subject: f.subject || null, topic: f.topic || null, question_ids: chosen.map((q) => q.id), total, status: "in progress" }))?.id ?? null;
    setRun({ mode, qs: chosen, i: 0, answers: {}, marks: {}, revealed: false, testId, started: nowMs(), limit: mode === "test" ? Math.round(total * 1.2 * 60) : 0, done: false, attemptIds: {} });
    setNow(nowMs());
  };
  const saveAttempt = async (q: Row, marks: number | null, by = "self") => {
    if (!run) return null;
    const row = await rec("create", "question_attempts", { question_id: q.id, test_id: run.testId, subject: q.subject, topic: q.topic, subtopic: q.subtopic, answer: run.answers[q.id] ?? "", marks, total: Number(q.marks), marked_by: by, seconds: Math.round((nowMs() - run.started) / 1000) });
    if (row?.id) setRun((r) => (r ? { ...r, attemptIds: { ...r.attemptIds, [q.id]: row.id } } : r));
    return row;
  };
  const askMark = async (q: Row) => {
    const row = run?.attemptIds[q.id] ? { id: run.attemptIds[q.id] } : await saveAttempt(q, null, "apollo");
    if (!row) return;
    submit(`Mark my answer strictly against the mark scheme, then call mark_attempt with attempt_id ${row.id}. Explain which marking points I got and missed, and what a full-mark answer needs.\nQuestion (${q.marks} marks, ${q.subject} ${q.board ?? ""} ${q.topic ?? ""}): ${q.question}\nMark scheme: ${q.mark_scheme ?? "(none stored: use the board's standard)"}\nMy answer: ${run?.answers[q.id] ?? ""}`, { thread: "school:marking" });
  };
  const finishTest = async () => {
    if (!run) return;
    const m = run.qs.reduce((a, q) => a + (run.marks[q.id] ?? 0), 0), t = run.qs.reduce((a, q) => a + Number(q.marks), 0);
    for (const q of run.qs) if (!run.attemptIds[q.id]) await saveAttempt(q, run.marks[q.id] ?? 0);
    if (run.testId) await rec("update", "tests", { score: m, total: t, pct: pct(m, t), minutes: Math.round((nowMs() - run.started) / 600) / 100, status: "done" }, run.testId);
    setRun({ ...run, done: true });
    setTick((x) => x + 1);
    ctx.refresh?.();
  };

  /* ---------- running ---------- */
  if (run && cur) {
    const left = run.limit ? Math.max(0, run.limit - Math.round((now - run.started) / 1000)) : 0;
    const reviewing = run.mode === "test" && run.done;
    const showScheme = run.revealed || reviewing;
    const total = run.qs.reduce((a, q) => a + Number(q.marks), 0), got = run.qs.reduce((a, q) => a + (run.marks[q.id] ?? 0), 0);
    return (
      <div className={s.run}>
        <div className={s.bar}>
          <b>{run.mode === "test" ? (reviewing ? `Test done: ${got}/${total} (${pct(got, total)}%)` : "Test") : "Practice"}</b>
          <span>Question {run.i + 1} of {run.qs.length}</span>
          {run.mode === "test" && !reviewing && <span className={s.timer} data-low={left < 120}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>}
          <button className="pill" onClick={() => { setRun(null); setTick((x) => x + 1); }}>Exit</button>
        </div>
        <div className={s.q}>
          <div className={s.meta}>{cur.subject} · {cur.topic ?? "general"}{cur.subtopic ? ` › ${cur.subtopic}` : ""} · <b>[{cur.marks} mark{cur.marks > 1 ? "s" : ""}]</b> · <i data-src={cur.source}>{cur.source === "past paper" ? `${cur.board ?? ""} ${cur.paper ?? "past paper"} ${cur.year ?? ""} Q${cur.number ?? ""}` : cur.source}</i></div>
          <p className={s.text}>{cur.question}</p>
          <textarea className={s.answer} rows={6} placeholder="Your answer (working, steps, final answer)…" value={run.answers[cur.id] ?? ""} disabled={reviewing}
            onChange={(e) => setRun({ ...run, answers: { ...run.answers, [cur.id]: e.target.value } })} />
        </div>
        {showScheme ? (
          <div className={s.scheme}>
            <div className="label">Mark scheme</div>
            <p>{cur.mark_scheme ?? "No mark scheme stored."}</p>
            {cur.answer && <p><b>Answer:</b> {cur.answer}</p>}
            <div className={s.row}>
              <span className="label">Marks</span>
              {Array.from({ length: Number(cur.marks) + 1 }, (_, m) => (
                <button key={m} className={s.mk} data-on={run.marks[cur.id] === m} onClick={async () => {
                  setRun({ ...run, marks: { ...run.marks, [cur.id]: m } });
                  if (run.mode === "practice" || reviewing) {
                    const id = run.attemptIds[cur.id];
                    if (id) await rec("update", "question_attempts", { marks: m, total: Number(cur.marks) }, id); else await saveAttempt(cur, m);
                  }
                }}>{m}</button>
              ))}
              <button className="pill" onClick={() => askMark(cur)}>Have Apollo mark it</button>
            </div>
          </div>
        ) : (
          <div className={s.row}>
            {run.mode === "practice" && <button className="pill" data-active="true" onClick={() => setRun({ ...run, revealed: true })}>Check against mark scheme</button>}
            <button className="pill" onClick={() => submit(`Give me a hint (not the answer) for this ${cur.subject} question: ${cur.question}`, { thread: "school:marking" })}>Hint</button>
          </div>
        )}
        <div className={s.row}>
          <button className="pill" disabled={run.i === 0} onClick={() => setRun({ ...run, i: run.i - 1, revealed: false })}>◀ Previous</button>
          {run.i < run.qs.length - 1 && <button className="pill" onClick={() => setRun({ ...run, i: run.i + 1, revealed: false })}>Next ▶</button>}
          {run.mode === "test" && !run.done && <button className="pill" data-active="true" onClick={() => setRun({ ...run, done: true, i: 0 })}>Finish and mark</button>}
          {reviewing && <button className="pill" data-active="true" onClick={finishTest}>Save test result</button>}
        </div>
      </div>
    );
  }

  /* ---------- bank ---------- */
  return (
    <div className={s.wrap}>
      <div className={s.filters}>
        <select value={f.subject} onChange={(e) => setF({ subject: e.target.value, topic: "", subtopic: "", source: f.source })}><option value="">All subjects</option>{SUBJECTS.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value, subtopic: "" })}><option value="">All topics</option>{topics.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.subtopic} onChange={(e) => setF({ ...f, subtopic: e.target.value })}><option value="">All subtopics</option>{subtopics.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}><option value="">Any source</option><option>past paper</option><option>generated</option><option>mine</option></select>
        <span className="label">{pool.length} question{pool.length === 1 ? "" : "s"} · {pool.reduce((a, q) => a + Number(q.marks), 0)} marks</span>
      </div>
      <div className={s.row}>
        <button className="pill" data-active="true" disabled={!pool.length} onClick={() => start("practice", 10)}>Practise (weakest first)</button>
        <button className="pill" disabled={!mistakes.length} onClick={() => start("practice", 20, mistakes)}>Redo my mistakes ({mistakes.length})</button>
        <button className="pill" disabled={!pool.length} onClick={() => start("test", 8)}>Timed test (8 questions)</button>
        <button className="pill" disabled={!pool.length} onClick={() => start("test", 20)}>Full test (20)</button>
      </div>
      <div className={s.gen}>
        <span className="label">Ask Apollo for questions</span>
        <select value={gen.n} onChange={(e) => setGen({ ...gen, n: Number(e.target.value) })}>{[3, 5, 8, 12, 20].map((n) => <option key={n} value={n}>{n}</option>)}</select>
        <select value={gen.style} onChange={(e) => setGen({ ...gen, style: e.target.value })}>
          <option value="generated">in the exact style of the board</option>
          <option value="past paper">real past-paper questions (paste or link the paper in chat)</option>
          <option value="flashcards">as flashcards instead</option>
        </select>
        <button className="pill" disabled={!f.subject} title={f.subject ? "" : "Pick a subject first"} onClick={() => {
          const what = `${f.subject}${f.topic ? `, topic ${f.topic}` : ""}${f.subtopic ? `, subtopic ${f.subtopic}` : ""}`;
          if (gen.style === "flashcards") submit(`Make ${gen.n * 3} flashcards for ${what}, to the mark scheme.`, { mode: "flashcards" });
          else if (gen.style === "past paper") submit(`Add ${gen.n} real past-paper questions for ${what} with their official mark schemes. Only use papers you can actually read (my notes/uploads or the board's published PDF via ingest_url); tell me which paper and year. If you can't get real ones, say so.`, { mode: "questions" });
          else submit(`Write ${gen.n} exam questions for ${what}, exactly in the style of my board's papers, with full mark schemes.`, { mode: "questions" });
        }}>Generate</button>
      </div>
      <div className={s.cols}>
        <div>
          <div className="label">Your scores by topic {overall.t ? `· overall ${pct(overall.m, overall.t)}%` : ""}</div>
          {stats.length ? (
            <ul className={s.stats}>
              {stats.map((x) => (
                <li key={x.k}><span>{x.k}</span><i style={{ ["--v" as string]: `${x.pct}%` }} data-tone={x.pct < 50 ? "bad" : x.pct < 75 ? "mid" : "good"} /><b>{x.pct}%</b><small>{x.marks}/{x.total} · {x.n}</small></li>
              ))}
            </ul>
          ) : <p className="label">No attempts yet.</p>}
        </div>
        <div>
          <div className="label">Questions</div>
          <ul className={s.list}>
            {pool.slice(0, 80).map((q) => {
              const a = byQ.get(q.id);
              const last = a?.[0];
              return (
                <li key={q.id}>
                  <span className={s.src} data-src={q.source}>{q.source === "past paper" ? `${q.year ?? "PP"}` : q.source === "mine" ? "mine" : "gen"}</span>
                  <span className={s.qt}>{q.question}</span>
                  <small>{q.topic ?? ""} · {q.marks}m{last?.marks != null ? ` · last ${last.marks}/${last.total}` : ""}</small>
                </li>
              );
            })}
            {!pool.length && <li className="label">No questions here yet. Use Generate, or paste a past paper into the chat and ask Apollo to add its questions.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
