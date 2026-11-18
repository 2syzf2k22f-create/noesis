"use client";
// School extras: past-paper mining, the homework checker, the spec mastery map, life vs grades,
// the university application hub and the offline pack.
import { useEffect, useMemo, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { RoomChat } from "./RoomChat";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics"];
const field: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" };
const data = (binds: object[]) => fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds }) }).then((r) => r.json());

/** Past papers -> individual questions in the bank, tagged with spec codes and exam scope, with their mark schemes. */
export function PastPaperMiner() {
  const { submit } = useApollo();
  const [files, setFiles] = useState<A[]>([]);
  const [f, setF] = useState({ paper: "", scheme: "", subject: "Maths", year: "", name: "" });
  useEffect(() => { fetch("/api/files").then((r) => r.json()).then((j) => setFiles((j?.files ?? []).filter((x: A) => /pdf|docx/i.test(`${x.mime} ${x.name}`)))).catch(() => {}); }, []);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <small className="label">Upload the paper and its mark scheme in Library › Files (or drag them into chat), pick them here, and every question goes into your bank with its marks, mark scheme, spec codes and real-paper label. Lessons, mocks and reviews then use them.</small>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} style={field}>{SUBJ.map((s) => <option key={s}>{s}</option>)}</select>
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Paper (e.g. Paper 1)" style={{ ...field, width: 140 }} />
        <input value={f.year} onChange={(e) => setF({ ...f, year: e.target.value })} placeholder="Year" style={{ ...field, width: 80 }} />
        <select value={f.paper} onChange={(e) => setF({ ...f, paper: e.target.value })} style={field}><option value="">Question paper…</option>{files.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={f.scheme} onChange={(e) => setF({ ...f, scheme: e.target.value })} style={field}><option value="">Mark scheme…</option>{files.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <button className="pill" data-active="true" disabled={!f.paper} onClick={() => submit(`Mine this real past paper into my question bank. Read the question paper (read_saved_file id ${f.paper}, every page) ${f.scheme ? `and its mark scheme (read_saved_file id ${f.scheme}) ` : ""}and add EVERY question part with add_questions: subject ${f.subject}, source 'past paper', paper '${f.name}', year '${f.year}', number (e.g. 3(b)(ii)), marks, the question text exactly (LaTeX for maths), its mark scheme copied exactly${f.scheme ? "" : " (none given: leave empty)"}, and spec_code (get_spec to match; the most specific statement). Also, for each statement a question tests that has no exam_scope yet, save one with set_exam_scope. Reply with how many questions per topic.`, { mode: "questions", model: "sonnet" })}>Mine it</button>
      </div>
    </div>
  );
}

/** Photograph or upload a whole homework sheet: every question marked, mistakes logged to reviews. */
export function HomeworkChecker() {
  const [conv, setConv] = useState<string | null>(null);
  useEffect(() => { fetch("/api/chats?space=study:homework").then((r) => r.json()).then((j) => { if (Array.isArray(j) && j[0]) setConv(j[0].id); }).catch(() => {}); }, []);
  return <RoomChat space="study:homework" conversationId={conv} onConversation={setConv} mode="tutor" height={420}
    context="Homework checker. Reg sends photos or files of a homework sheet with his answers. Mark EVERY question like a mark scheme (M1/A1 style for maths), give the mark per question and a total, show the correct method where he went wrong, then log each distinct mistake with create on mistakes (subject, topic, spec_code, what, fix, why) so they come back in his reviews. If the homework is on Teams/the site's homework list, match it and note the result there."
    empty={<p className="label">📷 Send photos of your homework (several pages is fine) or a PDF. Every question gets marked, and each mistake goes into your reviews.</p>} />;
}

/** The whole spec as tiles: colour = confidence; a dot = exam scope mapped; a ring = scope covered in a lesson. */
export function MasteryMap() {
  const [rows, setRows] = useState<A[]>([]);
  const [lessons, setLessons] = useState<A[]>([]);
  const [subject, setSubject] = useState("Maths");
  useEffect(() => { void data([{ table: "spec_points", where: { subject, level: 4 }, limit: 500 }]).then((j) => setRows(j?.[0]?.rows ?? [])); fetch("/api/lessons").then((r) => r.json()).then((j) => setLessons(Array.isArray(j) ? j : [])).catch(() => {}); }, [subject]);
  const groups = useMemo(() => { const m = new Map<string, A[]>(); for (const p of [...rows].sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }))) { const k = String(p.code).split(/[a-z]$/i)[0].split(".").slice(0, 2).join("."); m.set(k, [...(m.get(k) ?? []), p]); } return [...m.entries()]; }, [rows]);
  const C = ["#4b5563", "#e5484d", "#f5a524", "#e5c34d", "#8fd14f", "#30a46c"];
  const counts = [0, 1, 2, 3, 4, 5].map((c) => rows.filter((p) => Number(p.confidence ?? 0) === c).length);
  void lessons;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>{SUBJ.map((s) => <button key={s} className="pill" data-active={subject === s} onClick={() => setSubject(s)}>{s}</button>)}<span style={{ flex: 1 }} />{["unrated", "1", "2", "3", "4", "5"].map((l, i) => <span key={l} className="label" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 3, background: C[i], display: "inline-block" }} />{l} {counts[i]}</span>)}</div>
      <small className="label">{rows.length} statements · {rows.filter((p) => Array.isArray(p.exam_scope)).length} with exam scope mapped (•). Hover a tile for the statement; click to start a lesson on it.</small>
      {groups.map(([k, ps]) => (
        <div key={k} style={{ display: "flex", gap: 3, flexWrap: "wrap", alignItems: "center" }}>
          <small className="label" style={{ width: 48 }}>{k}</small>
          {ps.map((p) => <a key={p.id} href={`/s/school/tutor?new=${encodeURIComponent(`${subject}|${p.code}|${Number(p.confidence ?? 0) >= 4 ? "revise" : "teach"}`)}`} title={`${p.code} · confidence ${p.confidence ?? "–"}\n${String(p.text ?? p.title ?? "").slice(0, 200)}`} style={{ width: 22, height: 22, borderRadius: 5, background: C[Number(p.confidence ?? 0)], display: "grid", placeItems: "center", fontSize: 9, color: "#111", textDecoration: "none" }}>{Array.isArray(p.exam_scope) ? "•" : ""}</a>)}
        </div>
      ))}
    </div>
  );
}

/** How sleep, workouts, screen time and revision line up with your scores, week by week. */
export function LifeInsights() {
  const [d, setD] = useState<A>(null);
  useEffect(() => { fetch("/api/life").then((r) => r.json()).then(setD).catch(() => {}); }, []);
  if (!d) return <div className="label">Loading…</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {d.findings.map((f: string) => <div key={f} style={{ fontSize: 14 }}>• {f}</div>)}
      <div className={u.mdTableWrap}><table className={u.mdTable}><thead><tr><th>Factor</th><th>vs scores (r, weeks)</th><th>vs revision (r, weeks)</th></tr></thead><tbody>{d.correlations.map((c: A) => <tr key={c.factor}><td>{c.factor}</td><td>{c.vs_score.r ?? "–"} ({c.vs_score.n})</td><td>{c.vs_revision ? `${c.vs_revision.r ?? "–"} (${c.vs_revision.n})` : "–"}</td></tr>)}</tbody></table></div>
      <small className="label">r runs from -1 to 1; around 0 means no pattern. Computed from your logs, last 12 weeks.</small>
    </div>
  );
}

/** University applications: shortlist vs predicted grades, deadlines, and personal statement drafts with feedback. */
export function UniApps() {
  const { submit } = useApollo();
  const [courses, setCourses] = useState<A[]>([]);
  const [pred, setPred] = useState<Record<string, string>>({});
  const [conv, setConv] = useState<string | null>(null);
  useEffect(() => {
    void data([{ table: "courses", limit: 200 }]).then((j) => setCourses((j?.[0]?.rows ?? []).filter((c: A) => c.status !== "rejected")));
    fetch("/api/school-analysis").then((r) => r.json()).then((j) => setPred(Object.fromEntries((j?.subjects ?? []).map((s: A) => [s.subject, s.grade ?? s.predicted ?? "?"])))).catch(() => {});
    fetch("/api/chats?space=study:ucas").then((r) => r.json()).then((j) => { if (Array.isArray(j) && j[0]) setConv(j[0].id); }).catch(() => {});
  }, []);
  const year = new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const predicted = Object.values(pred).filter((g) => g && g !== "?").join("");
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={u.row} style={{ gap: 10, flexWrap: "wrap" }}>
        <span><span className="label">Predicted now</span><br /><b>{Object.entries(pred).map(([k, v]) => `${k} ${v}`).join(" · ") || "no data yet"}</b></span>
        <span><span className="label">Deadlines</span><br /><b>Oxford, Cambridge, medicine: 15 Oct {year - 1} · everything else: 14 Jan {year} (18:00)</b></span>
      </div>
      <div className={u.mdTableWrap}><table className={u.mdTable}><thead><tr><th>Course</th><th>Typical offer</th><th>Required</th><th>Test / interview</th><th>Status</th></tr></thead><tbody>
        {courses.map((c) => <tr key={c.id}><td><b>{c.name}</b><br /><small>{c.uni}</small></td><td>{c.typical_offer ?? "–"}{c.typical_offer && predicted ? <small className="label"> vs {predicted}</small> : null}</td><td>{c.required_subjects ?? "–"}</td><td>{[c.admissions_test, c.interview ? "interview" : null].filter(Boolean).join(", ") || "–"}</td><td>{c.status}</td></tr>)}
        {!courses.length && <tr><td colSpan={5} className="label">No courses shortlisted yet (University › Explore).</td></tr>}
      </tbody></table></div>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="pill" data-active="true" onClick={() => submit("Draft my UCAS personal statement (2026 format: the three questions, 4,000 characters total) for my shortlisted courses (courses table). Use what you know about me (facts, school analysis, opportunities). Save it with make_document (kind letter) and open it.", { model: "sonnet" })}>Draft personal statement</button>
        <button className="pill" onClick={() => submit("For each shortlisted course, compare the typical offer and required subjects with my current predicted grades, and list exactly what I need to raise and by how much.")}>Offers vs predicted</button>
        <button className="pill" onClick={() => submit("Add my UCAS deadlines, admissions tests and interview windows for my shortlisted courses as events and reminders.")}>Add deadlines</button>
      </div>
      <RoomChat space="study:ucas" conversationId={conv} onConversation={setConv} mode="chat" height={340} context="University application hub. Help with the personal statement (feedback by the three UCAS questions, character count), course choices, admissions tests and interviews. Be specific and honest." placeholder="Paste a draft for feedback, or ask about courses, tests, interviews…" />
    </div>
  );
}

/** One click: today's notes, reviews and lessons saved on this device for when school Wi-Fi blocks things. */
export function OfflinePack() {
  const [msg, setMsg] = useState("");
  const go = async () => {
    setMsg("Saving…");
    const notes = await fetch("/api/notes").then((r) => r.json()).catch(() => []);
    const lessons = await fetch("/api/lessons").then((r) => r.json()).catch(() => []);
    const urls = ["/s/review", "/s/school", "/s/school/notes", "/s/school/tutor", "/s/school/planner", "/api/notes", "/api/lessons", "/api/sr?view=status", "/api/sr?view=queue&area=all", "/api/sr?view=queue&area=school", "/api/sr?view=queue&area=languages", "/api/sr?view=queue&area=mind",
      ...(Array.isArray(notes) ? notes.slice(0, 40).map((n: A) => `/api/notes?id=${n.id}`) : []), ...(Array.isArray(lessons) ? lessons.slice(0, 10).map((l: A) => `/api/lessons?id=${l.id}`) : [])];
    let ok = 0;
    const c = await caches.open("noesis-shell-v3").catch(() => null);
    for (const x of urls) { try { const r = await fetch(x, { cache: "no-store" }); if (r.ok && c) { await c.put(x, r.clone()); ok++; } } catch {} }
    setMsg(`Saved ${ok} pages and data on this device: notes, reviews and lessons now work without the internet. Answers sync when you're back online.`);
  };
  return <div className={u.row} style={{ gap: 8, flexWrap: "wrap" }}><button className="pill" data-active="true" onClick={() => void go()}>⬇ Make today available offline</button><small className="label">{msg}</small></div>;
}
