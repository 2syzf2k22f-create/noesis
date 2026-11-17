"use client";
// A timed mock exam for one upcoming test, on its own screen: questions from the bank on that test's
// spec codes (or ones Apollo generated for it, tagged mock:<test id>), marks close to the real paper,
// a countdown, End session at any time, then self-marking against the mark scheme (or Apollo marks it).
// Attempts go to question_attempts and the paper to tests, so readiness, spec evidence and stats update.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApollo } from "@/shell/apollo";
import { RichText } from "./RichText";
import { EndSession } from "./EndSession";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const rec = (op: "create" | "update", table: string, data: object, id?: string) => fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, table, data, id }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const nowMs = () => Date.now();
const pct = (m: number, t: number) => (t ? Math.round((m / t) * 1000) / 10 : 0);

export function MockExamButton({ d }: { d: A }) {
  const [pool, setPool] = useState<A[] | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "questions", limit: 500 }] }) })
      .then((r) => r.json()).then((j) => {
        const codes: string[] = d.topics.flatMap((t: A) => t.codes);
        setPool((j?.[0]?.rows ?? []).filter((q: A) => !q.deleted_at && ((q.tags ?? []).includes(`mock:${d.id}`) || (q.subject === d.subject && q.spec_code && codes.some((c) => q.spec_code === c || String(q.spec_code).startsWith(c))))));
      }).catch(() => setPool([]));
  }, [d.id, d.subject, d.topics]);
  if (!pool) return null;
  return (
    <>
      <button className="pill" data-active="true" disabled={!pool.length} title={pool.length ? "" : "No questions on this test's spec codes yet: use Generate a mock first"} onClick={() => setOpen(true)}>⏱ Sit a timed mock ({pool.length} Qs available)</button>
      {open && <MockExam d={d} pool={pool} onClose={() => setOpen(false)} />}
    </>
  );
}

function MockExam({ d, pool, onClose }: { d: A; pool: A[]; onClose: () => void }) {
  const { submit } = useApollo();
  const target = Number(d.total_marks ?? 50);
  // pick questions to about the real paper's marks, weakest topics first, then shuffle the order
  const [qs] = useState<A[]>(() => {
    const weak = (q: A) => { const t = d.topics.find((x: A) => x.codes.some((c: string) => String(q.spec_code ?? "").startsWith(c))); return t?.confidence ?? 3; };
    const sorted = [...pool].sort((a, b) => weak(a) - weak(b) || Math.random() - 0.5);
    const out: A[] = []; let m = 0;
    for (const q of sorted) { if (m >= target) break; out.push(q); m += Number(q.marks) || 0; }
    return out.sort(() => Math.random() - 0.5);
  });
  const total = qs.reduce((a, q) => a + Number(q.marks || 0), 0);
  const minutes = Number(d.duration_min) || Math.max(10, Math.round(total * 1.2));
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [phase, setPhase] = useState<"sit" | "mark" | "done">("sit");
  const [now, setNow] = useState(0);
  const [t0, setT0] = useState(0);
  const started = useRef(0);
  const testId = useRef<string | null>(null);
  useEffect(() => {
    started.current = nowMs(); queueMicrotask(() => { setNow(nowMs()); setT0(started.current); });
    void rec("create", "tests", { title: `Mock: ${d.title}`, subject: d.subject, question_ids: qs.map((q) => q.id), total, status: "in progress" }).then((r) => { testId.current = r?.id ?? null; });
    const t = setInterval(() => setNow(nowMs()), 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const left = Math.max(0, minutes * 60 - Math.round((now - t0) / 1000));
  useEffect(() => { if (phase === "sit" && now && left === 0) queueMicrotask(() => { setPhase("mark"); setI(0); }); }, [left, phase, now]);
  const got = Object.values(marks).reduce((a, b) => a + b, 0);
  const save = async () => {
    const secs = Math.round((nowMs() - started.current) / 1000);
    for (const q of qs) await rec("create", "question_attempts", { question_id: q.id, test_id: testId.current, subject: q.subject, topic: q.topic, subtopic: q.subtopic, spec_code: q.spec_code ?? null, answer: answers[q.id] ?? "", marks: marks[q.id] ?? 0, total: Number(q.marks), marked_by: "self", seconds: Math.round(secs / qs.length) });
    if (testId.current) await rec("update", "tests", { score: got, total, pct: pct(got, total), minutes: Math.round(secs / 6) / 10, status: "done" }, testId.current);
    setPhase("done");
  };
  const q = qs[i];
  const shell = (body: React.ReactNode) => createPortal(
    <div role="dialog" aria-label="Mock exam" style={{ position: "fixed", inset: 0, zIndex: 320, background: "var(--bg)", display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px max(12px, 3vw)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <b style={{ flex: 1 }}>Mock: {d.title}</b>
        <span className="label">{phase === "sit" ? `Question ${i + 1} of ${qs.length} · ${total} marks` : phase === "mark" ? `Marking ${i + 1} of ${qs.length} · ${got}/${total}` : "Finished"}</span>
        {phase === "sit" && <b style={{ fontVariantNumeric: "tabular-nums", color: left < 300 ? "var(--danger)" : undefined }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b>}
      </div>
      <div style={{ overflowY: "auto", padding: "18px max(12px, 4vw)", display: "grid", justifyItems: "center", alignContent: "start" }}>{body}</div>
      <EndSession active={phase !== "done"} kind="mock exam" area="school" unit={phase === "sit" ? "answered" : "marked"}
        stats={{ answered: phase === "sit" ? Object.values(answers).filter((x) => x.trim()).length : Object.keys(marks).length, lines: [phase === "sit" ? "Ending now skips the rest of the time and nothing is saved until you mark it." : `${got}/${total} marks so far (only saved when you press Save result).`] }}
        onEnd={() => { if (testId.current) void rec("update", "tests", { status: "abandoned" }, testId.current); onClose(); }} />
    </div>, document.body);

  if (phase === "done") return shell(
    <div style={{ display: "grid", gap: 12, width: "min(640px, 100%)" }}>
      <b style={{ fontSize: 24 }}>{got}/{total} ({pct(got, total)}%)</b>
      <span className="label">Saved to your question attempts and tests: readiness, spec evidence and stats now include it.</span>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{qs.map((x) => <li key={x.id} style={{ fontSize: 13 }}>{x.spec_code ?? x.topic}: {marks[x.id] ?? 0}/{x.marks}</li>)}</ul>
      <div className={u.row}><button className="pill" data-active="true" onClick={() => { submit(`I just sat a timed mock for "${d.title}": ${got}/${total}. Per question: ${qs.map((x) => `${x.spec_code ?? x.topic} ${marks[x.id] ?? 0}/${x.marks}`).join(", ")}. Tell me what to revise first before the real test and update the plan.`, { mode: "tutor" }); onClose(); }}>Debrief with Apollo</button><button className="pill" onClick={onClose}>Close</button></div>
    </div>);
  return shell(
    <div style={{ display: "grid", gap: 12, width: "min(820px, 100%)" }}>
      <div className="label">{q.spec_code ? `Spec ${q.spec_code} · ` : ""}{q.topic ?? ""} · <b>[{q.marks} mark{Number(q.marks) === 1 ? "" : "s"}]</b></div>
      <div style={{ padding: 16, borderRadius: 12, background: "var(--surface)", fontSize: 16 }}><RichText text={q.question} /></div>
      {phase === "sit" ? (
        <textarea value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} rows={8} placeholder="Your answer (LaTeX works: $x^2$)" style={{ padding: 10, borderRadius: 10, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", font: "15px var(--font-body)" }} />
      ) : (
        <>
          <div style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)" }}><span className="label">Your answer</span><RichText text={answers[q.id] || "(blank)"} /></div>
          <div style={{ padding: 12, borderRadius: 10, background: "var(--surface-2)" }}><span className="label">Mark scheme</span><RichText text={q.mark_scheme ?? q.answer ?? "No mark scheme stored: ask Apollo to mark it."} /></div>
          <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
            <span className="label">Marks:</span>
            {Array.from({ length: Number(q.marks) + 1 }, (_, m) => <button key={m} className="pill" data-active={marks[q.id] === m} onClick={() => setMarks({ ...marks, [q.id]: m })}>{m}</button>)}
            <button className="pill" onClick={() => submit(`Mark this strictly against the mark scheme and tell me the mark out of ${q.marks}.\nQuestion: ${q.question}\nMark scheme: ${q.mark_scheme ?? "(none)"}\nMy answer: ${answers[q.id] ?? ""}`, { thread: "school:marking" })}>Ask Apollo to mark</button>
          </div>
        </>
      )}
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="pill" disabled={i === 0} onClick={() => setI(i - 1)}>◀ Previous</button>
        {i < qs.length - 1 && <button className="pill" onClick={() => setI(i + 1)}>Next ▶</button>}
        {phase === "sit" && <button className="pill" data-active="true" onClick={() => { setPhase("mark"); setI(0); }}>Finish and mark</button>}
        {phase === "mark" && <button className="pill" data-active="true" disabled={Object.keys(marks).length < qs.length} title={Object.keys(marks).length < qs.length ? "Give every question a mark first" : ""} onClick={() => void save()}>Save result ({Object.keys(marks).length}/{qs.length} marked)</button>}
      </div>
    </div>);
}
