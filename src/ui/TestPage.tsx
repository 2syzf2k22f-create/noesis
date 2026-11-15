"use client";
// One upcoming test: header, readiness (computed), topics with spec codes / scope / unverified badges /
// confidence / evidence, weakest first, the built-in "Revise for this test" session with Apollo, the
// revision plan, reminders, linked homework, result entry after the test, and test history.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { RichText } from "./RichText";
import { CONF_COLOR } from "./SpecBlock";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const post = (body: object) => fetch("/api/tests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const field: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "13px var(--font-body)", minWidth: 0 };
const card: React.CSSProperties = { padding: 14, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", gap: 8, alignContent: "start", minWidth: 0 };
const fmtDate = (d: string, t?: string | null) => `${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${t ? `, ${t}` : ""}`;
export const countdown = (days: number) => (days < 0 ? `${-days} day${days === -1 ? "" : "s"} ago` : days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`);
const readyColor = (r: number) => (r >= 75 ? "#30a46c" : r >= 55 ? "#e2c044" : r >= 35 ? "#f5a524" : "#e5484d");

export function TestPage({ id }: { id: string }) {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  const [tick, setTick] = useState(0);
  const [session, setSession] = useState<A>(null);
  const [edit, setEdit] = useState(false);
  const [result, setResult] = useState(false);
  const [clash, setClash] = useState<string[]>([]);
  const load = useCallback(() => fetch(`/api/tests/${id}`).then((r) => (r.ok ? r.json() : { error: r.status })).then(setD).catch(() => setD({ error: true })), [id]);
  useEffect(() => { void load(); }, [load, changes, tick]);
  useEffect(() => { fetch("/api/tests").then((r) => r.json()).then((j) => setClash((j.clashes ?? []).filter((c: string) => d?.title && c.includes(d.title)))).catch(() => {}); }, [d?.title]);
  const reload = () => setTick((t) => t + 1);
  if (!d) return <div className="label">Loading…</div>;
  if (d.error) return <div className={u.nodata}>{d.error === 404 ? "This test doesn't exist (or was deleted)." : "Couldn't load the test."}</div>;
  const active = d.sessions?.find((s: A) => s.status === "active" || s.status === "paused");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* header */}
      <div style={{ ...card, gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
            <span className="pill">{d.subject}</span>
            <span className="pill" data-active={d.days <= 3 && d.days >= 0}>{countdown(d.days)}</span>
            <span className="pill">{d.status}</span>
            {d.week && <span className="pill">Week {d.week}</span>}
          </div>
          <b style={{ fontSize: 15 }}>{fmtDate(d.date, d.start_time ? `${d.start_time}${d.end_time ? `–${d.end_time}` : ""}` : null)}{d.room ? ` · room ${d.room}` : ""}</b>
          <small className="label">{d.topics.length} topics{d.total_marks ? ` · ${d.total_marks} marks` : ""}{d.target_grade ? ` · target ${d.target_grade}` : ""}{d.duration_min ? ` · ${d.duration_min} min` : ""}{d.calculator_allowed != null ? ` · calculator ${d.calculator_allowed ? "allowed" : "not allowed"}` : ""}</small>
          {d.notes && <small>{d.notes}</small>}
        </div>
        <div className={u.row} style={{ flexWrap: "wrap", gap: 4, justifyContent: "flex-end" }}>
          <button className="pill" onClick={() => setEdit(true)}>✎ Edit</button>
          <button className="pill" onClick={async () => { const r = await post({ action: "duplicate", id }); if (r.id) location.href = `/s/school/tests/${r.id}`; }}>⎘ Duplicate</button>
          <button className="pill" onClick={() => { location.href = "/api/tests/ics"; }} title="Download all upcoming tests as a calendar file">📅 Add to calendar</button>
          {d.status === "upcoming" && <button className="pill" onClick={() => setResult(true)}>Enter result</button>}
          <button className="pill" onClick={async () => { if (confirm("Delete this test? It goes to the trash; its reminders and plan sessions are removed.")) { await post({ action: "delete", id }); location.href = "/s/school/tests"; } }}>🗑</button>
        </div>
      </div>
      {clash.map((c) => <div key={c} className="pill" style={{ justifySelf: "start", background: "#f5a52422", whiteSpace: "normal", height: "auto", padding: "4px 10px" }}>⚠ {c}</div>)}

      {/* revise button + readiness */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", gap: 12 }}>
        <div style={card}>
          <span className="label">Readiness for this test</span>
          <b style={{ fontSize: 40, color: readyColor(d.readiness) }}>{d.readiness}%</b>
          <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}><div style={{ width: `${d.readiness}%`, height: "100%", borderRadius: 4, background: readyColor(d.readiness) }} /></div>
          <small>Predicted: <b>{d.predicted_grade}</b>{d.target_note ? ` (${d.target_note})` : ""}</small>
          <small className="label">From your spec confidence, question attempts, flashcards/questions coverage and open mistakes on these topics. Rate topics below to sharpen it.</small>
        </div>
        <div style={card}>
          <span className="label">Revise</span>
          {!session && <>
            <button className="pill" data-active="true" style={{ height: 48, fontSize: 16, display: "flex", justifyContent: "center", alignItems: "center" }} onClick={async () => setSession({ ...(await post({ action: "session_start", id, order_mode: "weakest" })), topic_id: null, mode: "weakest" })}>
              {active ? "▶ Resume revision for this test" : "▶ Revise for this test"}
            </button>
            <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
              <button className="pill" onClick={async () => setSession({ ...(await post({ action: "session_start", id, order_mode: "chapter" })), topic_id: null, mode: "chapter" })}>In chapter order</button>
              <MockButton d={d} />
            </div>
          </>}
          {session && <small className="label">Revision session running below.</small>}
          <small className="label">Weakest first: {d.weakest.map((w: A) => `${w.label} (${w.readiness}%)`).join(" · ") || "rate topics to see"}</small>
        </div>
      </div>

      {session && <RevisionPanel d={d} session={session} onEnd={() => { setSession(null); reload(); }} />}

      {/* topics */}
      <section style={card}>
        <span className="label">Topics ({d.topics.length})</span>
        {d.topics.map((t: A) => <TopicRow key={t.id} t={t} d={d} onChanged={reload} onRevise={async () => setSession({ ...(await post({ action: "session_start", id, topic_id: t.id })), topic_id: t.id, mode: "topic" })} />)}
        {!d.topics.length && <small className="label">No topics yet. Edit the test to add them.</small>}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 12 }}>
        <PlanPanel d={d} onChanged={reload} />
        <RemindersPanel d={d} onChanged={reload} />
        <section style={card}>
          <span className="label">Linked homework</span>
          {d.homework.length ? d.homework.map((h: A) => <div key={h.id} style={{ fontSize: 13 }}>{h.status === "done" ? "✓ " : "• "}{h.title}{h.due_at ? <small className="label"> · due {new Date(h.due_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small> : null}</div>) : <small className="label">None linked.</small>}
          <span className="label" style={{ marginTop: 6 }}>Past {d.subject} tests</span>
          {d.history.length ? d.history.slice(0, 6).map((h: A) => <Link key={h.id} href={`/s/school/tests/${h.id}`} style={{ fontSize: 13 }}>{h.date} · {h.title}{h.result_marks != null ? ` · ${h.result_marks}${h.total_marks ? `/${h.total_marks}` : ""}` : ""}{h.result_grade ? ` (${h.result_grade})` : ""}</Link>) : <small className="label">No earlier tests yet.</small>}
          {d.sessions?.filter((s: A) => s.status === "done").slice(0, 4).map((s: A) => <small key={s.id} className="label">Session {new Date(s.created_at).toLocaleDateString("en-GB")}: {(s.covered ?? []).length} topics · {s.minutes} min</small>)}
        </section>
      </div>

      {edit && <EditTest d={d} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      {result && <ResultEntry d={d} onClose={() => setResult(false)} onSaved={() => { setResult(false); reload(); }} />}
    </div>
  );
}

function TopicRow({ t, d, onChanged, onRevise }: { t: A; d: A; onChanged: () => void; onRevise: () => void }) {
  const [open, setOpen] = useState(false);
  const conf = t.confidence == null ? null : Math.round(t.confidence);
  return (
    <div style={{ padding: 10, borderRadius: 10, background: "var(--surface-2)", borderLeft: `4px solid ${readyColor(t.readiness)}`, display: "grid", gap: 6 }}>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6, alignItems: "baseline" }}>
        {t.chapter && <span className="pill" style={{ height: 22, fontSize: 11 }}>{t.chapter}</span>}
        <b style={{ flex: 1, minWidth: 140 }}>{t.label}</b>
        <span style={{ color: readyColor(t.readiness), fontWeight: 800 }}>{t.readiness}%</span>
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        {t.codes.map((c: string) => <Link key={c} className="pill" href={`/s/school/spec?subject=${encodeURIComponent(d.subject)}&code=${encodeURIComponent(c)}`} style={{ height: 22, fontSize: 11, borderColor: t.unverified.some((x: string) => x === c || x.startsWith(c)) ? "var(--danger)" : undefined }}>{c}</Link>)}
        {t.unverified.length > 0 && <span className="pill" style={{ height: 22, fontSize: 11, color: "var(--danger)" }} title={`Not yet checked against the official spec: ${t.unverified.join(", ")}`}>unverified: {t.unverified.join(", ")}</span>}
        {t.missing.length > 0 && <span className="pill" style={{ height: 22, fontSize: 11, color: "var(--danger)" }}>not in spec: {t.missing.join(", ")}</span>}
      </div>
      {(t.scope_note || t.excluded) && <small>{t.scope_note && <>Scope: {t.scope_note}. </>}{t.excluded && <b>Not on the test: {t.excluded}.</b>}</small>}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((c) => <button key={c} className="pill" title="How confident are you? (also sets these spec statements)" onClick={async () => { await post({ action: "topic_confidence", topic_id: t.id, confidence: c }); onChanged(); }} style={{ minWidth: 28, padding: "0 6px", background: conf === c ? CONF_COLOR[c] : undefined, color: conf === c ? "#111" : undefined }}>{c}</button>)}
        <button className="pill" onClick={onRevise}>▶ Revise this topic</button>
        <button className="pill" onClick={() => setOpen(!open)}>{open ? "Hide" : "Statements"} ({t.statements.length})</button>
        <small className="label" style={{ marginLeft: "auto" }}>🃏 {t.evidence.cards} · ❓ {t.evidence.questions} · ✍ {t.evidence.attempts}{t.evidence.attempt_pct != null ? ` (${t.evidence.attempt_pct}%)` : ""} · ⚠ {t.evidence.mistakes} · ⏱ {t.minutes}m · {t.last_revised ? `last ${new Date(t.last_revised).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : "not revised yet"}</small>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 4 }}>
          {t.statements.map((s: A) => <div key={s.id} style={{ fontSize: 12.5, borderLeft: `3px solid ${CONF_COLOR[s.confidence ?? 0]}`, paddingLeft: 8 }}><b>{s.code}</b> {s.title && s.text ? <b>{s.title}. </b> : null}<RichText text={s.text ?? s.title} inline />{!s.verified && <span style={{ color: "var(--danger)" }}> · unverified</span>}</div>)}
          {!t.statements.length && <small className="label">{t.headings.length ? `Only the topic heading${t.headings.length > 1 ? "s are" : " is"} imported (${t.headings.map((h: A) => `${h.code} ${h.title}`).join(", ")}); import the full statements on School › Spec.` : "No spec statements for these codes yet."}</small>}
        </div>
      )}
    </div>
  );
}

/** The built-in revision session: progress across topics + the conversation with Apollo, on this page. */
function RevisionPanel({ d, session, onEnd }: { d: A; session: A; onEnd: () => void }) {
  const { submit, reply } = useApollo();
  const thread = `test:${d.id}${session.topic_id ? `:${session.topic_id}` : ""}`;
  const [msgs, setMsgs] = useState<{ id: string; role: string; content: string }[]>([]);
  const [state, setState] = useState<A>(session);
  const [text, setText] = useState("");
  const [paused, setPaused] = useState(false);
  const started = useRef(false);
  const list = useRef<HTMLDivElement>(null);
  const topics = useMemo(() => {
    const ts = session.topic_id ? d.topics.filter((t: A) => t.id === session.topic_id) : [...d.topics];
    return session.mode === "chapter" ? ts : ts.sort((a: A, b: A) => a.readiness - b.readiness);
  }, [d.topics, session]);
  // first message: Apollo gets the session id, the ordered topics with codes, scope and exclusions
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const lines = topics.map((t: A, i: number) => `${i + 1}. [topic_id ${t.id}] ${t.chapter ? `${t.chapter} ` : ""}${t.label}: spec ${t.codes.join(", ") || "none"}${t.unverified.length ? ` (UNVERIFIED: ${t.unverified.join(", ")})` : ""}${t.scope_note ? `; scope: ${t.scope_note}` : ""}${t.excluded ? `; NOT on the test: ${t.excluded}` : ""}; readiness ${t.readiness}%`).join("\n");
    const resume = (session.covered ?? []).length ? `This is a RESUMED session: already covered topic ids ${(session.covered ?? []).join(", ")}; carry on from the next one.` : "";
    submit(`[Revise for this test] Session ${session.id} for "${d.title}" (${d.subject}, ${d.date}). ${resume}
Topics in order:
${lines}
Run the revision session here, one topic at a time:
1) revision_session progress (topic_id) when you start a topic; get_spec for its codes and stay strictly inside that wording, the scope note and the exclusions (say "not in the spec as I have it" for unverified/missing statements).
2) Short recap, then exam-style questions ONE at a time with marks in ${d.subject === "Economics" ? "Edexcel" : d.subject === "Physics" ? "AQA" : "OCR"} style (LaTeX for maths). Wait for my answer, mark it against a mark scheme (M1/A1/B1), log it with mark_attempt / question_attempts (spec_code), give feedback, then offer another or move on.
3) Mix in a blurt, an "explain it back" and flashcards for missing ones (save with spec_code; don't duplicate existing cards).
4) Log mistakes (mistakes table, spec_code); update my confidence with set_spec_confidence when I say so or the marks show it; log time with create_record in study_sessions (subject, topic, spec_code, minutes).
5) After each topic: revision_session progress with finished=true, marks, out_of, minutes.
6) At the end: a short timed mini-test across the topics, then revision_session end with a summary (covered, scores per topic, weakest left, next session).
Start with the first topic now.`, { thread });
  }, [d, session, submit, thread, topics]);
  const loadMsgs = useCallback(async () => {
    const convs = await fetch(`/api/chats?space=${encodeURIComponent(thread)}`).then((r) => r.json()).catch(() => []);
    const c = Array.isArray(convs) ? convs.find((x: A) => x.space === thread) ?? convs[0] : null;
    if (c) { const j = await fetch(`/api/chats/${c.id}`).then((r) => r.json()).catch(() => null); if (j?.messages) setMsgs(j.messages); }
    const s = await fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "test_sessions", where: { id: session.id }, limit: 1 }] }) }).then((r) => r.json()).catch(() => null);
    const row = s?.[0]?.rows?.[0]; if (row) setState(row);
  }, [thread, session.id]);
  useEffect(() => { queueMicrotask(() => void loadMsgs()); const t = setInterval(loadMsgs, 4000); return () => clearInterval(t); }, [loadMsgs, reply?.pending]);
  useEffect(() => { list.current?.scrollTo({ top: 1e9 }); }, [msgs, reply?.text]);
  const covered: string[] = state.covered ?? [];
  const scores = state.scores ?? {};
  const earned = Object.values(scores).reduce((a: number, x: A) => a + Number(x.marks ?? 0), 0), of = Object.values(scores).reduce((a: number, x: A) => a + Number(x.out_of ?? 0), 0);
  const live = reply && (reply.pending || reply.text) ? reply : null;
  const send = () => { const t = text.trim(); if (!t) return; setText(""); setMsgs((m) => [...m, { id: `l${m.length}`, role: "user", content: t }]); submit(t, { thread }); };
  return (
    <section style={{ ...card, border: "1px solid var(--accent)" }}>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <b style={{ flex: 1 }}>Revising: {session.topic_id ? topics[0]?.label : d.title}</b>
        <small className="label">{covered.length}/{topics.length} topics · {earned}/{of} marks · {state.minutes ?? 0} min</small>
        {paused ? <button className="pill" onClick={async () => { await post({ action: "session_resume", session_id: session.id }); setPaused(false); submit("Let's carry on where we left off.", { thread }); }}>▶ Resume</button>
          : <button className="pill" onClick={async () => { await post({ action: "session_pause", session_id: session.id }); setPaused(true); }}>⏸ Pause</button>}
        <button className="pill" onClick={() => submit("Skip this topic for now and move on to the next one (mark it not finished).", { thread })}>Skip topic</button>
        <button className="pill" onClick={() => { submit("Let's stop here: give me the end summary (covered, scores per topic, weakest left, what to do next session) and end the session with revision_session end.", { thread }); setTimeout(onEnd, 1500); }}>End session</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, topics.length)}, 1fr)`, gap: 3 }}>
        {topics.map((t: A) => <i key={t.id} title={t.label} style={{ height: 8, borderRadius: 4, background: covered.includes(t.id) ? "var(--accent)" : state.current_topic_id === t.id ? "color-mix(in srgb, var(--accent) 45%, transparent)" : "var(--surface-2)" }} />)}
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        {topics.map((t: A) => <small key={t.id} className="pill" data-active={state.current_topic_id === t.id} style={{ height: 22, fontSize: 11 }}>{covered.includes(t.id) ? "✓ " : ""}{t.label}{scores[t.id] ? ` ${scores[t.id].marks}/${scores[t.id].out_of}` : ""}</small>)}
      </div>
      <div ref={list} style={{ maxHeight: "55vh", overflowY: "auto", display: "grid", gap: 8, padding: 4 }}>
        {msgs.filter((m) => !m.content.startsWith("[Revise for this test]")).map((m) => (
          <div key={m.id} style={{ justifySelf: m.role === "user" ? "end" : "start", maxWidth: "88%", padding: "8px 12px", borderRadius: 12, background: m.role === "user" ? "color-mix(in srgb, var(--accent) 20%, var(--surface-2))" : "var(--surface-2)" }}><RichText text={m.content} /></div>
        ))}
        {live && live.pending && <div style={{ justifySelf: "start", maxWidth: "88%", padding: "8px 12px", borderRadius: 12, background: "var(--surface-2)", opacity: 0.85 }}>{live.text ? <RichText text={live.text} /> : "Apollo is thinking…"}</div>}
      </div>
      <div className={u.row} style={{ gap: 6, alignItems: "flex-end" }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={3} placeholder="Your answer (maths as $x^2$). Enter to send, Shift+Enter for a new line." style={{ ...field, height: "auto", padding: 8, flex: 1 }} />
        <button className="pill" data-active="true" onClick={send}>Send</button>
      </div>
    </section>
  );
}

function MockButton({ d }: { d: A }) {
  const { submit } = useApollo();
  return <button className="pill" onClick={() => submit(`Make me a mock paper for "${d.title}" (${d.subject}): questions only from these topics, marks proportional to how much each topic covers, total about ${d.total_marks ?? 50} marks, in exam-board style with full mark schemes (LaTeX for maths). Topics: ${d.topics.map((t: A) => `${t.label} [${t.codes.join(", ")}]${t.scope_note ? ` scope: ${t.scope_note}` : ""}${t.excluded ? ` NOT: ${t.excluded}` : ""}`).join("; ")}. Save the questions to my question bank with spec_code and tags "mock:${d.id}", then tell me to open School › Questions and start a timed test from them (${d.duration_min ?? 50} minutes). When I've done it, mark it and save the result to past_papers.`, { mode: "questions" })}>📝 Practise this test (mock)</button>;
}

function PlanPanel({ d, onChanged }: { d: A; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <section style={card}>
      <span className="label">Revision plan to the test</span>
      {d.plan.length ? d.plan.map((p: A) => <div key={p.id} className={u.row} style={{ fontSize: 12.5 }}><span style={{ flex: 1 }}>{p.done ? "✓ " : ""}{new Date(`${String(p.date).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · {p.topic}</span><small className="label">{p.minutes}m · {p.kind}</small></div>) : <small className="label">No plan yet.</small>}
      <button className="pill" style={{ justifySelf: "start" }} disabled={busy} onClick={async () => { setBusy(true); await post({ action: "plan" }); setBusy(false); onChanged(); }}>{busy ? "Planning…" : d.plan.length ? "Rebuild plan" : "Make the plan"}</button>
      <small className="label">Uses your study hours, weakest topics first, and shares slots with other tests coming up. It appears in School › Planner.</small>
    </section>
  );
}

function RemindersPanel({ d, onChanged }: { d: A; onChanged: () => void }) {
  const rs = d.reminder_settings ?? { days_before: [7, 3, 1], morning_of: "07:00", nudges: true };
  const [days, setDays] = useState<number[]>(rs.days_before ?? []);
  const [morning, setMorning] = useState<string>(rs.morning_of ?? "");
  const [nudges, setNudges] = useState<boolean>(!!rs.nudges);
  return (
    <section style={card}>
      <span className="label">Reminders</span>
      {d.reminders.length ? d.reminders.map((r: A) => <div key={r.id} style={{ fontSize: 12.5, opacity: r.read_at ? 0.5 : 1 }}>{new Date(r.deliver_at).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} · {r.title}</div>) : <small className="label">None scheduled.</small>}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        {[14, 7, 3, 2, 1].map((n) => <button key={n} className="pill" data-active={days.includes(n)} onClick={() => setDays(days.includes(n) ? days.filter((x) => x !== n) : [...days, n].sort((a, b) => b - a))}>{n}d before</button>)}
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <label className="label">Morning of <input type="time" value={morning} onChange={(e) => setMorning(e.target.value)} style={field} /></label>
        <label className="label" style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={nudges} onChange={(e) => setNudges(e.target.checked)} />&ldquo;Start revising&rdquo; nudge</label>
      </div>
      <button className="pill" style={{ justifySelf: "start" }} onClick={async () => { await post({ action: "update", id: d.id, reminder_settings: { days_before: days, morning_of: morning || null, nudges } }); onChanged(); }}>Save reminders</button>
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "min(720px, 100%)", maxHeight: "92vh", overflow: "auto", padding: 16, display: "grid", gap: 10, background: "var(--bg)" }}>
        <div className={u.row}><b style={{ flex: 1 }}>{title}</b><button className="pill" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

function EditTest({ d, onClose, onSaved }: { d: A; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ title: d.title, date: d.date, start_time: d.start_time ?? "", end_time: d.end_time ?? "", room: d.room ?? "", total_marks: d.total_marks ?? "", target_grade: d.target_grade ?? "", duration_min: d.duration_min ?? "", calculator_allowed: d.calculator_allowed ?? "", notes: d.notes ?? "" });
  const [topics, setTopics] = useState<A[]>(d.topics.map((t: A) => ({ label: t.label, chapter: t.chapter ?? "", spec_codes: (t.codes ?? []).join(", "), scope_note: t.scope_note ?? "", excluded: t.excluded ?? "" })));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Edit test" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6 }}>
        {[["title", "Title (short)"], ["date", "Date"], ["start_time", "Start"], ["end_time", "End"], ["room", "Room"], ["total_marks", "Total marks"], ["target_grade", "Target grade"], ["duration_min", "Minutes"]].map(([k, l]) => (
          <label key={k} className="label">{l}<input type={k === "date" ? "date" : k.endsWith("time") ? "time" : "text"} value={(f as A)[k]} onChange={set(k)} style={{ ...field, width: "100%" }} /></label>
        ))}
        <label className="label">Calculator<select value={String(f.calculator_allowed)} onChange={set("calculator_allowed")} style={{ ...field, width: "100%" }}><option value="">?</option><option value="true">allowed</option><option value="false">not allowed</option></select></label>
      </div>
      <label className="label">Notes<textarea value={f.notes} onChange={set("notes")} rows={2} style={{ ...field, height: "auto", width: "100%", padding: 6 }} /></label>
      <span className="label">Topics (spec codes from School › Spec, comma-separated)</span>
      {topics.map((t, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "70px minmax(0, 2fr) minmax(0, 2fr) minmax(0, 2fr) minmax(0, 2fr) 28px", gap: 4 }}>
          {(["chapter", "label", "spec_codes", "scope_note", "excluded"] as const).map((k) => <input key={k} value={t[k]} placeholder={k.replace("_", " ")} onChange={(e) => setTopics(topics.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} style={field} />)}
          <button className="pill" style={{ padding: 0 }} onClick={() => setTopics(topics.filter((_, j) => j !== i))}>✕</button>
        </div>
      ))}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        <button className="pill" onClick={() => setTopics([...topics, { label: "", chapter: "", spec_codes: "", scope_note: "", excluded: "" }])}>＋ Topic</button>
        {d.chapter_maps.map((m: A) => <button key={m.id} className="pill" onClick={() => setTopics([...topics, { label: m.label ?? m.chapter, chapter: m.chapter, spec_codes: (m.spec_codes ?? []).join(", "), scope_note: m.scope_note ?? "", excluded: "" }])}>＋ {m.chapter} {m.label}</button>)}
      </div>
      <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => {
        await post({ action: "update", id: d.id, ...f, total_marks: f.total_marks ? Number(f.total_marks) : null, duration_min: f.duration_min ? Number(f.duration_min) : null, calculator_allowed: f.calculator_allowed === "" ? null : String(f.calculator_allowed) === "true" });
        await post({ action: "topics", id: d.id, topics: topics.filter((t) => t.label.trim()).map((t) => ({ ...t, spec_codes: t.spec_codes.split(/[,\s]+/).filter(Boolean) })) });
        onSaved();
      }}>Save</button>
    </Modal>
  );
}

function ResultEntry({ d, onClose, onSaved }: { d: A; onClose: () => void; onSaved: () => void }) {
  const [marks, setMarks] = useState<Record<string, { got: string; of: string }>>({});
  const [total, setTotal] = useState(String(d.total_marks ?? "")), [score, setScore] = useState(""), [grade, setGrade] = useState(""), [notes, setNotes] = useState(""), [mist, setMist] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <Modal title={`Result: ${d.title}`} onClose={onClose}>
      <small className="label">Marks per topic (if you know them), the overall score, and what went wrong. It saves a School test with per-topic marks and logs the mistakes.</small>
      {d.topics.map((t: A) => (
        <div key={t.id} className={u.row} style={{ gap: 6 }}>
          <span style={{ flex: 1, fontSize: 13 }}>{t.chapter ? `${t.chapter} ` : ""}{t.label}</span>
          <input value={marks[t.id]?.got ?? ""} onChange={(e) => setMarks({ ...marks, [t.id]: { got: e.target.value, of: marks[t.id]?.of ?? "" } })} placeholder="got" style={{ ...field, width: 60 }} />/
          <input value={marks[t.id]?.of ?? ""} onChange={(e) => setMarks({ ...marks, [t.id]: { of: e.target.value, got: marks[t.id]?.got ?? "" } })} placeholder="of" style={{ ...field, width: 60 }} />
        </div>
      ))}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <input value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score (blank = sum)" style={field} />
        <input value={total} onChange={(e) => setTotal(e.target.value)} placeholder="Out of" style={field} />
        <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="Grade" style={field} />
      </div>
      <textarea value={mist} onChange={(e) => setMist(e.target.value)} rows={4} placeholder="Mistakes, one per line (each goes to your mistake log)" style={{ ...field, height: "auto", padding: 8 }} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes" style={{ ...field, height: "auto", padding: 8 }} />
      {msg && <div style={{ color: "var(--danger)" }}>{msg}</div>}
      <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => {
        const m = Object.fromEntries(Object.entries(marks).filter(([, v]) => v.got !== "" && v.of !== "").map(([k, v]) => [k, { got: Number(v.got), of: Number(v.of) }]));
        const r = await post({ action: "result", id: d.id, marks: m, score: score ? Number(score) : undefined, total: total ? Number(total) : undefined, grade: grade || undefined, notes, mistakes: mist.split("\n").map((x) => x.trim()).filter(Boolean).map((what) => ({ what })) });
        if (r.error) setMsg(r.error); else onSaved();
      }}>Save result</button>
    </Modal>
  );
}
