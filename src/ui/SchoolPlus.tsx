"use client";
// School features: weak spec statements, spaced spec review, blurt practice, exam readiness + runway,
// confidence calibration, grade boundaries + converter, mistake patterns, grade trends, past-paper grid,
// Apollo study actions (quick quiz, mixed practice, formula sheet, homework autopilot, weekly review),
// subject balance vs targets, plan vs done, study streak, command words, and a spec-tagged study timer.

import { FxButton, MathPreview } from "./MathTools";
import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { CONF_COLOR } from "./SpecBlock";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics"];
const post = (url: string, body: object) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const field: React.CSSProperties = { height: 32, padding: "0 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "13px var(--font-body)" };

/* shared loaders (one request per page, refreshed when Apollo changes things) */
let insightsP: Promise<A> | null = null, insightsAt = 0;
function useInsights() {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  useEffect(() => {
    if (!insightsP || Date.now() - insightsAt > 5000) { insightsAt = Date.now(); insightsP = fetch("/api/school/insights").then((r) => (r.ok ? r.json() : null)).catch(() => null); }
    let live = true; void insightsP.then((j) => { if (live) setD(j ?? { error: true }); });
    return () => { live = false; };
  }, [changes]);
  return d;
}
function useWeak(limit = 12) {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { fetch(`/api/spec?view=weak&limit=${limit}`).then((r) => (r.ok ? r.json() : null)).then((j) => setD(j ?? { weak: [], due: [] })).catch(() => setD({ weak: [], due: [] })); }, [changes, tick, limit]);
  return [d, () => setTick((t) => t + 1)] as const;
}
const Empty = ({ children }: { children: React.ReactNode }) => <div className={u.nodata}>{children}</div>;
const ConfButtons = ({ r, done }: { r: A; done: () => void }) => (
  <span style={{ display: "inline-flex", gap: 3 }}>{[1, 2, 3, 4, 5].map((c) => <button key={c} className="pill" style={{ minWidth: 26, padding: "0 6px", background: r.confidence === c ? CONF_COLOR[c] : undefined, color: r.confidence === c ? "#111" : undefined }} onClick={async () => { await post("/api/spec", { id: r.id, confidence: c }); done(); }}>{c}</button>)}</span>
);
const evShort = (e: A) => `${e.cards} cards · ${e.questions} Qs${e.attempt_pct != null ? ` · ${e.attempt_pct}%` : ""}${e.mistakes ? ` · ${e.mistakes} mistakes` : ""}`;

/* 1. weakest statements */
export function WeakSpec({ p }: { p: A }) {
  const { submit } = useApollo();
  const [d, reload] = useWeak(p?.limit ?? 8);
  if (!d) return null;
  if (!d.weak.length) return <Empty>No spec statements yet. Import them on School › Spec.</Empty>;
  return (
    <ol style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
      {d.weak.map((r: A) => (
        <li key={r.id} style={{ fontSize: 13 }}>
          <b>{r.subject} {r.code}</b> {String(r.text ?? r.title ?? "").slice(0, 110)}
          <div className={u.row} style={{ flexWrap: "wrap", gap: 4, marginTop: 2 }}>
            <ConfButtons r={r} done={reload} />
            <button className="pill" onClick={() => submit(`Revise ${r.subject} spec ${r.code} with me now: teach it briefly, then quiz me (3 questions), mark my answers, and set my confidence with set_spec_confidence. Use get_spec for the exact wording.`, { thread: `spec:${r.subject}` })}>Revise now</button>
            <small className="label">{evShort(r.evidence)}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* 2. spaced review of the spec */
export function SpecReview() {
  const [d, reload] = useWeak(5);
  if (!d) return null;
  if (!d.due.length) return <Empty>Nothing due. Statements come back for a re-rating sooner the less confident you are (1 day for a 1, three weeks for a 5).</Empty>;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <small className="label">{d.due.length} statement{d.due.length === 1 ? "" : "s"} due for a confidence check. Rate honestly; it schedules the next check.</small>
      {d.due.slice(0, 10).map((r: A) => (
        <div key={r.id} style={{ fontSize: 13, padding: 8, borderRadius: 8, background: "var(--surface)" }}>
          <b>{r.subject} {r.code}</b> {String(r.text ?? r.title ?? "").slice(0, 160)}
          <div style={{ marginTop: 4 }}><ConfButtons r={r} done={reload} /></div>
        </div>
      ))}
    </div>
  );
}

/* 3. blurt practice */
export function Blurt() {
  const { submit } = useApollo();
  const [d] = useWeak(20);
  const [subject, setSubject] = useState("Maths");
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const pick = d?.weak?.find((r: A) => r.subject === subject);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <small className="label">Write everything you remember about a spec point without notes. Apollo marks it against the exact spec wording, lists what you missed and updates your confidence.</small>
      <div className={u.row} style={{ flexWrap: "wrap" }}>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} style={field}>{SUBJ.map((s) => <option key={s}>{s}</option>)}</select>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={pick ? `Code, e.g. ${pick.code}` : "Spec code"} style={{ ...field, width: 150 }} />
        {pick && !code && <button className="pill" onClick={() => setCode(pick.code)}>Use weakest: {pick.code}</button>}
      </div>
      <textarea id="blurt-box" value={text} onChange={(e) => setText(e.target.value)} rows={7} placeholder="Blurt here…" style={{ ...field, height: "auto", padding: 10 }} />
      <div className={u.row}><FxButton target={() => document.getElementById("blurt-box") as HTMLTextAreaElement | null} value={text} set={setText} /><MathPreview value={text} /></div>
      <button className="pill" data-active="true" disabled={!code || text.trim().length < 10} style={{ justifySelf: "start" }}
        onClick={() => { submit(`Mark my blurt for ${subject} spec ${code}. Use get_spec(${subject}, ${code}) for the exact statements, compare point by point, score it 0-100, list exactly what I missed or got wrong, save it with create_record in blurts (subject, spec_code, recalled, score, missed, feedback), and set my confidence with set_spec_confidence. My blurt:\n${text}`, { thread: `spec:${subject}` }); setText(""); }}>Mark my blurt</button>
    </div>
  );
}

/* 4 + 5. exam readiness, grade, gap to A*, exam runway */
export function Readiness() {
  const d = useInsights();
  if (!d) return null;
  if (d.error) return <Empty>Couldn&apos;t load (database not connected?).</Empty>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
      {d.subjects.map((s: A) => (
        <div key={s.subject} style={{ padding: 10, borderRadius: 10, background: "var(--surface)", display: "grid", gap: 4 }}>
          <span className="label">{s.subject}</span>
          <b style={{ fontSize: "clamp(20px, 10cqw, 30px)" }}>{s.readiness ?? "–"}<small className="label">/100 ready</small></b>
          <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)" }}><div style={{ width: `${s.readiness ?? 0}%`, height: "100%", borderRadius: 3, background: (s.readiness ?? 0) >= 80 ? "#30a46c" : (s.readiness ?? 0) >= 60 ? "#e2c044" : "#e5484d" }} /></div>
          <small>{s.grade ? `Working at ${s.grade}` : "No marks yet"}{s.to_a_star ? ` · ${s.to_a_star} pts to A*` : s.grade === "A*" ? " · at A*" : ""}</small>
          <small className="label">confidence {s.avg_confidence ?? "–"}/5 · coverage {s.coverage_pct}% · {s.rated}/{s.statements} rated</small>
          {s.exam ? <small>{s.exam.title}: <b>{s.exam.days} days</b> · {s.not_ready} statements below 4 → <b>{s.per_day_needed}/day</b></small> : <small className="label">No exam date set</small>}
        </div>
      ))}
    </div>
  );
}

/* 6. confidence vs results */
export function Calibration() {
  const d = useInsights();
  if (!d?.subjects) return null;
  const rows = d.subjects.flatMap((s: A) => s.calibration.map((c: A) => ({ ...c, subject: s.subject })));
  if (!rows.length) return <Empty>Needs both confidence ratings and question attempts tagged with spec codes. Then it shows where your confidence doesn&apos;t match your marks.</Empty>;
  return (
    <table className={u.table} style={{ width: "100%", fontSize: 12.5 }}>
      <thead><tr><th>Topic</th><th>Confidence</th><th>Actual</th><th>Verdict</th></tr></thead>
      <tbody>{rows.sort((a: A, b: A) => Math.abs(b.confidence_pct - b.actual_pct) - Math.abs(a.confidence_pct - a.actual_pct)).map((r: A) => (
        <tr key={r.subject + r.topic}><td>{r.subject} {r.topic}</td><td>{r.confidence_pct}%</td><td>{r.actual_pct}%</td>
          <td style={{ color: r.verdict === "overconfident" ? "var(--danger)" : r.verdict === "underconfident" ? "#f5a524" : "var(--good)" }}>{r.verdict}</td></tr>
      ))}</tbody>
    </table>
  );
}

/* 7. grade boundaries + converter */
export function GradeBoundaries() {
  const d = useInsights();
  const { submit } = useApollo();
  const [subject, setSubject] = useState("Maths");
  const [marks, setMarks] = useState(""), [total, setTotal] = useState("");
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  if (!d?.subjects) return null;
  const s = d.subjects.find((x: A) => x.subject === subject);
  const b: Record<string, number> = s.bounds;
  const pct = marks && total ? (Number(marks) / Number(total)) * 100 : null;
  const g = pct == null ? null : Object.entries(b).sort((x, y) => y[1] - x[1]).find(([, v]) => pct >= v)?.[0] ?? "U";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row} style={{ flexWrap: "wrap" }}>
        <select value={subject} onChange={(e) => { setSubject(e.target.value); setEdit(null); }} style={field}>{SUBJ.map((x) => <option key={x}>{x}</option>)}</select>
        <input value={marks} onChange={(e) => setMarks(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Marks" style={{ ...field, width: 80 }} />
        <span>/</span>
        <input value={total} onChange={(e) => setTotal(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Out of" style={{ ...field, width: 80 }} />
        {pct != null && <b>{pct.toFixed(1)}% → {g}{g !== "A*" ? ` · ${Math.ceil(((b["A*"] - pct) / 100) * Number(total))} more marks for A*` : ""}</b>}
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        {Object.entries(b).sort((x, y) => y[1] - x[1]).map(([k, v]) => edit
          ? <label key={k} className="label">{k} <input value={edit[k] ?? String(v)} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} style={{ ...field, width: 56 }} />%</label>
          : <span key={k} className="pill">{k} ≥ {v}%</span>)}
        {edit ? <button className="pill" data-active="true" onClick={async () => { await post("/api/school/insights", { grade_boundaries: { [subject]: Object.fromEntries(Object.entries({ ...b, ...edit }).map(([k, v]) => [k, Number(v)])) } }); setEdit(null); insightsAt = 0; location.reload(); }}>Save</button>
          : <button className="pill" onClick={() => setEdit({})}>Edit boundaries</button>}
        <button className="pill" onClick={() => submit(`Find the most recent official grade boundaries for my ${subject} A level (board: see subjects), as overall % for A*, A, B, C, D, E, and tell me them so I can enter them on School › Tests.`)}>Look them up with Apollo</button>
      </div>
      <small className="label">Used to grade your tests and past papers across School. Defaults are typical A-level % until you set the real ones.</small>
    </div>
  );
}

/* 8. mistake patterns */
export function MistakePatterns() {
  const d = useInsights();
  const { submit } = useApollo();
  if (!d?.patterns) return null;
  const p = d.patterns;
  if (!p.open) return <Empty>No open mistakes. Log them on School › Tests (or tell Apollo) and patterns show up here.</Empty>;
  const max = Math.max(...p.by_topic.map((x: A) => x.count));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <small className="label">{p.open} open mistakes · {p.recurring} topics with repeats</small>
      {p.by_topic.map((x: A) => (
        <div key={x.key} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 1fr) 2fr 30px", gap: 6, alignItems: "center", fontSize: 12.5 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.key}</span>
          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}><div style={{ width: `${(x.count / max) * 100}%`, height: "100%", borderRadius: 4, background: x.count >= 2 ? "#e5484d" : "#f5a524" }} /></div>
          <b>{x.count}</b>
        </div>
      ))}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        {p.by_kind.map((k: A) => <span key={k.key} className="pill">{k.key}: {k.count}</span>)}
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        <button className="pill" onClick={() => submit("Classify my unresolved mistakes (mistakes table) by kind: careless, knowledge, method, misread, time. Set kind and the best spec_code on each with update_record (use get_spec to find codes). Then tell me the pattern in 3 lines.")}>Classify with Apollo</button>
        <button className="pill" onClick={() => submit("Turn my recurring unresolved mistakes into flashcards (front: the trap, back: the fix) tagged with their spec_code, and save them.")}>Recurring → flashcards</button>
      </div>
    </div>
  );
}

/* 9. grade trend per subject */
export function GradeTrend() {
  const d = useInsights();
  if (!d?.subjects) return null;
  const series = d.subjects.filter((s: A) => s.trend.length);
  if (!series.length) return <Empty>Log tests or past papers to see your trend.</Empty>;
  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];
  const times = series.flatMap((s: A) => s.trend.map((t: A) => Date.parse(t.at)));
  const t0 = Math.min(...times), t1 = Math.max(...times, t0 + 864e5);
  const X = (at: string) => 30 + ((Date.parse(at) - t0) / (t1 - t0)) * 560, Y = (pct: number) => 10 + (1 - pct / 100) * 160;
  const aStar = d.subjects[0].bounds["A*"];
  return (
    <div>
      <svg viewBox="0 0 600 190" style={{ width: "100%", height: "auto" }}>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1="30" x2="590" y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeDasharray="2 4" /><text x="2" y={Y(v) + 4} fontSize="10" fill="var(--text-dim)">{v}%</text></g>)}
        <line x1="30" x2="590" y1={Y(aStar)} y2={Y(aStar)} stroke="#30a46c" strokeDasharray="6 4" /><text x="560" y={Y(aStar) - 4} fontSize="10" fill="#30a46c">A*</text>
        {series.map((s: A, i: number) => (
          <g key={s.subject}>
            <polyline fill="none" stroke={colors[i % 4]} strokeWidth="2" points={s.trend.map((t: A) => `${X(t.at)},${Y(t.pct)}`).join(" ")} />
            {s.trend.map((t: A, k: number) => <circle key={k} cx={X(t.at)} cy={Y(t.pct)} r="3.5" fill={colors[i % 4]} data-tip={`${s.subject} · ${t.kind} ${t.label ?? ""}: ${t.pct}% (${t.at})`} />)}
          </g>
        ))}
      </svg>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 8 }}>{series.map((s: A, i: number) => <small key={s.subject}><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: colors[i % 4], marginRight: 4 }} />{s.subject}</small>)}</div>
    </div>
  );
}

/* 10. past paper grid */
export function PaperGrid() {
  const d = useInsights();
  const { submit } = useApollo();
  if (!d?.grid) return null;
  const any = d.grid.some((g: A) => g.cells.length);
  if (!any) return <Empty>No past papers logged yet.</Empty>;
  const col = (pct: number | null) => (pct == null ? "var(--surface-2)" : pct >= 80 ? "#30a46c" : pct >= 70 ? "#7ac77a" : pct >= 60 ? "#e2c044" : pct >= 50 ? "#f5a524" : "#e5484d");
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {d.grid.filter((g: A) => g.cells.length).map((g: A) => {
        const years = [...new Set(g.cells.map((c: A) => c.year))].sort() as string[], papers = [...new Set(g.cells.map((c: A) => c.paper))].sort() as string[];
        return (
          <div key={g.subject} style={{ overflowX: "auto" }}>
            <b style={{ fontSize: 13 }}>{g.subject}</b>
            <table style={{ borderCollapse: "separate", borderSpacing: 3, fontSize: 11.5 }}>
              <thead><tr><th />{years.map((y) => <th key={y} className="label">{y}</th>)}</tr></thead>
              <tbody>{papers.map((p) => <tr key={p}><td className="label">{p}</td>{years.map((y) => { const c = g.cells.filter((x: A) => x.paper === p && x.year === y).pop(); return <td key={y} title={c ? `${c.pct ?? "?"}% (${c.at})` : "not done"} style={{ minWidth: 38, height: 24, textAlign: "center", borderRadius: 5, background: col(c?.pct ?? null), color: c ? "#111" : "var(--text-dim)" }}>{c ? `${Math.round(c.pct ?? 0)}` : "·"}</td>; })}</tr>)}</tbody>
            </table>
          </div>
        );
      })}
      <button className="pill" style={{ justifySelf: "start" }} onClick={() => submit("Which past paper should I do next for each subject? Look at past_papers (what I've done and scores), my weakest spec statements (get_spec weakest) and exam dates. Pick one per subject and say why, with a link to the official paper if you can find it.")}>What should I do next?</button>
    </div>
  );
}

/* 11-15. Apollo study actions */
export function StudyActions() {
  const { submit } = useApollo();
  const [subject, setSubject] = useState("Maths");
  const acts: [string, string, string][] = [
    ["⚡ 5-minute quiz", "Quick quiz on my weakest statements", `Give me a 5-question quick quiz on my weakest ${subject} spec statements (get_spec weakest=true). One question at a time, mark each answer against the mark-scheme style, log each with create_record in question_attempts (subject, spec_code, marks, total, pct, marked_by 'apollo'), and update my confidence at the end.`],
    ["🔀 Mixed practice", "Interleaved set across all subjects", "Build a 6-question interleaved practice set mixing Maths, Further Maths, Physics and Economics from my highest-priority spec statements (get_spec weakest=true per subject). Save the questions to my question bank with spec_code, then ask me them one by one and mark them."],
    ["📐 Formula & definitions sheet", "Built only from the spec", `Make a one-page ${subject} formula and key-definitions sheet built ONLY from the spec statements (get_spec, whole subject; mark anything unverified). Save it to my Library › Files as Markdown (save_file) in folder "${subject}".`],
    ["🗓 Homework autopilot", "Estimate and schedule all homework", "For every open homework item, estimate how long it will take (from its title, subject and instructions), then schedule it into my planner (plan_items) before its due date around my timetable (current week) and existing plan. Tell me the schedule in a short list."],
    ["🧭 Weekly school review", "What went well, what to fix", "Do my weekly school review: compare this week's plan_items with what I actually did (study_sessions), my tests/attempts/mistakes this week, readiness per subject and my weakest spec statements. Give 3 wins, 3 problems and a concrete plan for next week, then add the next week's sessions to plan_items prioritising low-confidence and no-evidence statements."],
    ["🎯 Exam technique drill", "Command words for this subject", `Drill me on ${subject} exam technique: give me a short exam-style question using one command word, let me answer, then show what a full-mark answer must contain for that command word and mark mine. Repeat 3 times with different command words.`],
  ];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ ...field, justifySelf: "start" }}>{SUBJ.map((x) => <option key={x}>{x}</option>)}</select>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
        {acts.map(([t, sub, prompt]) => (
          <button key={t} onClick={() => submit(prompt, { thread: `school:${subject}` })} style={{ textAlign: "left", padding: 10, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", cursor: "pointer", display: "grid", gap: 2 }}>
            <b style={{ fontSize: 13.5 }}>{t}</b><small className="label">{sub}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

/* 16. subject balance vs weekly targets */
export function SubjectBalance() {
  const d = useInsights();
  const [edit, setEdit] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!d?.subjects) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {d.subjects.map((s: A) => {
        const pct = Math.min(100, Math.round((s.minutes_7d / Math.max(1, s.target_7d)) * 100));
        return (
          <div key={s.subject} style={{ display: "grid", gridTemplateColumns: "110px 1fr 90px", gap: 8, alignItems: "center", fontSize: 12.5 }}>
            <span>{s.subject}</span>
            <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}><div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: pct >= 100 ? "#30a46c" : pct >= 50 ? "#e2c044" : "#e5484d" }} /></div>
            {edit ? <input value={vals[s.subject] ?? String(s.target_7d)} onChange={(e) => setVals({ ...vals, [s.subject]: e.target.value.replace(/\D/g, "") })} style={{ ...field, width: 80 }} /> : <small>{s.minutes_7d}/{s.target_7d} min</small>}
          </div>
        );
      })}
      {edit ? <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => { await post("/api/school/insights", { subject_targets: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)])) }); setEdit(false); location.reload(); }}>Save targets</button>
        : <button className="pill" style={{ justifySelf: "start" }} onClick={() => setEdit(true)}>Set weekly targets</button>}
    </div>
  );
}

/* 17. planned vs done this week */
export function PlanVsDone() {
  const d = useInsights();
  if (!d?.plan_week) return null;
  const max = Math.max(60, ...d.plan_week.map((x: A) => Math.max(x.planned_min, x.studied_min)));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, alignItems: "end", height: 150 }}>
      {d.plan_week.map((x: A) => (
        <div key={x.day} style={{ display: "grid", gap: 3, alignItems: "end", height: "100%" }} data-tip={`${x.day}: planned ${x.planned_min} min (${x.done}/${x.planned} sessions done), studied ${x.studied_min} min`}>
          <div style={{ display: "flex", gap: 2, alignItems: "end", height: 110 }}>
            <div style={{ flex: 1, height: `${(x.planned_min / max) * 100}%`, background: "var(--surface-2)", borderRadius: 3 }} />
            <div style={{ flex: 1, height: `${(x.studied_min / max) * 100}%`, background: "var(--chart-1)", borderRadius: 3 }} />
          </div>
          <small className="label" style={{ textAlign: "center", fontWeight: x.day === today ? 800 : undefined }}>{new Date(x.day).toLocaleDateString("en-GB", { weekday: "short" })}<br />{x.done}/{x.planned}</small>
        </div>
      ))}
    </div>
  );
}

/* 18. study streak */
export function StudyStreak() {
  const d = useInsights();
  if (!d?.streak) return null;
  const s = d.streak, max = Math.max(30, ...s.last30.map((x: A) => x.minutes));
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row} style={{ gap: 16 }}>
        <div><b style={{ fontSize: 26 }}>{s.current}</b> <small className="label">day streak</small></div>
        <div><b style={{ fontSize: 18 }}>{s.best}</b> <small className="label">best</small></div>
        <div><b style={{ fontSize: 18 }}>{s.days_30}/30</b> <small className="label">days studied</small></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(30, 1fr)", gap: 2 }}>
        {s.last30.map((x: A) => <i key={x.day} data-tip={`${x.day}: ${x.minutes} min`} style={{ height: 18, borderRadius: 3, background: x.minutes ? `color-mix(in srgb, var(--chart-1) ${Math.round(25 + (x.minutes / max) * 75)}%, transparent)` : "var(--surface-2)" }} />)}
      </div>
    </div>
  );
}

/* 19. command words */
const WORDS: Record<string, [string, string][]> = {
  Maths: [["Show that", "Every step shown; reach the given answer exactly. Missing steps lose marks."], ["Hence", "Use the previous result; another method may get no marks."], ["Hence or otherwise", "Using the previous part is easiest, but any valid method works."], ["Exact", "Leave surds, π, logs or fractions: no rounded decimals."], ["Prove", "A complete, rigorous argument with a conclusion stated."], ["Determine / Find", "Working needed; a correct answer alone may not get full marks."], ["Sketch", "Shape, key points and asymptotes labelled; not to scale."]],
  "Further Maths": [["Show that", "Every step shown to the given result."], ["Prove by induction", "Base case, assumption, inductive step, conclusion sentence."], ["Hence", "Must use the previous part."], ["Exact", "No rounding."], ["Verify", "Substitute and show it works; state the conclusion."], ["Determine", "Justify each step."]],
  Physics: [["State", "A short answer, no explanation."], ["Describe", "Say what happens, step by step; no reasons needed."], ["Explain", "Give reasons/causes: 'because…', link to physics ideas."], ["Calculate", "Equation, substitution, answer with unit and sensible sig figs."], ["Show that", "Full working; give your answer to one more sig fig than shown."], ["Estimate", "Sensible assumed values, stated; order of magnitude answer."], ["Suggest", "Apply knowledge to a new context; more than one answer may be credited."], ["Compare", "Similarities AND differences, both sides each time."]],
  Economics: [["Define", "A precise definition (often 1-2 marks)."], ["Explain", "Reasons with a chain of reasoning; use a diagram where relevant."], ["Analyse", "Detailed chains of reasoning using economic theory and diagrams."], ["Assess", "Weigh up the importance of factors; come to a judgement."], ["Evaluate", "Both sides, weigh them, then a supported conclusion (magnitude, time, assumptions)."], ["Discuss", "Explore the issue from different viewpoints with a conclusion."], ["Calculate", "Show working; units and % where relevant."]],
};
export function CommandWords() {
  const [subject, setSubject] = useState("Economics");
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row} style={{ flexWrap: "wrap" }}>{SUBJ.map((x) => <button key={x} className="pill" data-active={subject === x} onClick={() => setSubject(x)}>{x}</button>)}</div>
      <dl style={{ margin: 0, display: "grid", gap: 6 }}>
        {WORDS[subject].map(([w, m]) => <div key={w}><dt style={{ fontWeight: 700 }}>{w}</dt><dd style={{ margin: 0, color: "var(--text-dim)", fontSize: 13 }}>{m}</dd></div>)}
      </dl>
      <small className="label">General guidance; your board&apos;s own command-word list is in its specification or assessment guide.</small>
    </div>
  );
}

/* 20. study timer tagged to a spec statement */
export function SpecTimer() {
  const [d] = useWeak(30);
  const [subject, setSubject] = useState("Maths");
  const [code, setCode] = useState("");
  const [start, setStart] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (!start) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [start]);
  const mins = start ? Math.floor((now - start) / 60000) : 0, secs = start ? Math.floor(((now - start) / 1000) % 60) : 0;
  const options = (d?.weak ?? []).filter((r: A) => r.subject === subject);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row} style={{ flexWrap: "wrap" }}>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} style={field} disabled={!!start}>{SUBJ.map((x) => <option key={x}>{x}</option>)}</select>
        <input list="spec-timer-codes" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Spec code (optional)" style={{ ...field, width: 170 }} disabled={!!start} />
        <datalist id="spec-timer-codes">{options.map((r: A) => <option key={r.code} value={r.code}>{String(r.text ?? r.title ?? "").slice(0, 60)}</option>)}</datalist>
      </div>
      <b style={{ fontSize: 34, fontVariantNumeric: "tabular-nums" }}>{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</b>
      {start ? (
        <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => {
          const minutes = Math.max(1, Math.round((Date.now() - start) / 60000));
          const r = await post("/api/records", { op: "create", table: "study_sessions", data: { subject, minutes, spec_code: code || null, topic: code || null, label: "Spec timer" } });
          setMsg(r.ok ? `Logged ${minutes} min of ${subject}${code ? ` (${code})` : ""}.` : "Couldn't log it."); setStart(null);
        }}>Stop and log</button>
      ) : <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={() => { setStart(Date.now()); setNow(Date.now()); setMsg(null); }}>Start</button>}
      {msg && <small className="label">{msg}</small>}
    </div>
  );
}
