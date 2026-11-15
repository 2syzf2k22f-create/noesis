"use client";
// Upcoming tests list (countdown, topics, readiness, clash warnings) + "Add a test" (time and room filled
// from the timetable lesson, topics from chapter maps). `compact` = countdown chips for dashboards.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { countdown } from "./TestPage";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
export const SUBJECT_COLOR: Record<string, string> = { Maths: "#5b8def", "Further Maths": "#8e4ec6", Physics: "#12a594", Economics: "#f5a524", Other: "#888" };
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics", "Other"];
const post = (body: object) => fetch("/api/tests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const field: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "13px var(--font-body)", minWidth: 0 };

let cache: Promise<A> | null = null, at = 0;
export function useTests() {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!cache || Date.now() - at > 4000) { at = Date.now(); cache = fetch("/api/tests").then((r) => (r.ok ? r.json() : null)).catch(() => null); }
    let live = true; void cache.then((j) => { if (live) setD(j ?? { upcoming: [], past: [], clashes: [] }); });
    return () => { live = false; };
  }, [changes, tick]);
  return [d, () => { at = 0; setTick((t) => t + 1); }] as const;
}

export function UpcomingTests({ p }: { p?: A }) {
  const [d, reload] = useTests();
  const [adding, setAdding] = useState(false);
  if (!d) return null;
  if (p?.compact) {
    if (!d.upcoming.length) return <div className={u.nodata}>No tests coming up.</div>;
    return (
      <div style={{ display: "grid", gap: 6 }}>
        {d.upcoming.slice(0, p.limit ?? 5).map((t: A) => (
          <Link key={t.id} href={`/s/school/tests/${t.id}`} className={u.row} style={{ gap: 8, padding: "6px 8px", borderRadius: 8, background: "var(--surface)", borderLeft: `4px solid ${SUBJECT_COLOR[t.subject] ?? "#888"}` }}>
            <b style={{ flex: 1, fontSize: 13 }}>{t.title}</b>
            <small className="label">{t.topics} topics · {t.readiness}% ready</small>
            <span className="pill" data-active={t.days <= 3} style={{ height: 22, fontSize: 11 }}>{countdown(t.days)}</span>
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <button className="pill" data-active="true" onClick={() => setAdding(true)}>＋ Add a test</button>
        <button className="pill" onClick={async () => { await post({ action: "plan" }); reload(); }}>Rebuild revision plan</button>
        <button className="pill" onClick={() => { location.href = "/api/tests/ics"; }}>📅 Calendar file</button>
      </div>
      {d.clashes.map((c: string) => <small key={c} style={{ color: "#f5a524" }}>⚠ {c}</small>)}
      {!d.upcoming.length && <div className={u.nodata}>No tests coming up. Add one, or tell Apollo (&ldquo;I have a Maths test on 18 Nov on chapters 1, 2, 3, 4 and 13&rdquo;).</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: 8 }}>
        {d.upcoming.map((t: A) => (
          <Link key={t.id} href={`/s/school/tests/${t.id}`} style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", borderTop: `4px solid ${SUBJECT_COLOR[t.subject] ?? "#888"}`, display: "grid", gap: 4, color: "var(--text)" }}>
            <div className={u.row}><b style={{ flex: 1 }}>{t.title}</b><span className="pill" data-active={t.days <= 3} style={{ height: 22, fontSize: 11 }}>{countdown(t.days)}</span></div>
            <small className="label">{new Date(`${t.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}{t.start_time ? ` · ${t.start_time}` : ""}{t.room ? ` · room ${t.room}` : ""} · {t.topics} topics</small>
            <div style={{ height: 6, borderRadius: 3, background: "var(--surface-2)" }}><div style={{ width: `${t.readiness}%`, height: "100%", borderRadius: 3, background: t.readiness >= 75 ? "#30a46c" : t.readiness >= 55 ? "#e2c044" : "#e5484d" }} /></div>
            <small className="label">{t.readiness}% ready · predicted {t.predicted_grade}</small>
          </Link>
        ))}
      </div>
      {d.past.length > 0 && <details><summary className="label" style={{ cursor: "pointer" }}>Past tests ({d.past.length})</summary>
        <div style={{ display: "grid", gap: 4, marginTop: 6 }}>{d.past.map((t: A) => <Link key={t.id} href={`/s/school/tests/${t.id}`} style={{ fontSize: 13 }}>{t.date} · {t.title} · {t.status}{t.result_marks != null ? ` · ${t.result_marks}${t.total_marks ? `/${t.total_marks}` : ""}` : ""} (readiness was {t.readiness}%)</Link>)}</div>
      </details>}
      {adding && <AddTest onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); location.href = `/s/school/tests/${id}`; }} />}
    </div>
  );
}

function AddTest({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [subject, setSubject] = useState("Maths");
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState<{ start: string; end: string; room: string; week: string } | null>(null);
  const [maps, setMaps] = useState<A[]>([]);
  const [chapters, setChapters] = useState<Set<string>>(new Set());
  const [marks, setMarks] = useState(""), [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "chapter_maps", where: { subject }, limit: 200 }] }) }).then((r) => r.json()).then((j) => setMaps(j?.[0]?.rows ?? [])).catch(() => setMaps([]));
  }, [subject]);
  useEffect(() => {
    if (!date) return;
    void post({ action: "lesson", subject, date }).then((j) => setTime(j?.lesson ? { start: j.lesson.start, end: j.lesson.end, room: j.lesson.room ?? "", week: j.week } : { start: "", end: "", room: "", week: j?.week ?? "" }));
  }, [subject, date]);
  return (
    <div role="dialog" aria-label="Add a test" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "min(600px, 100%)", maxHeight: "92vh", overflow: "auto", padding: 16, display: "grid", gap: 10, background: "var(--bg)" }}>
        <div className={u.row}><b style={{ flex: 1 }}>Add a test</b><button className="pill" onClick={onClose}>Close</button></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
          <label className="label">Subject<select value={subject} onChange={(e) => { setSubject(e.target.value); setChapters(new Set()); }} style={{ ...field, width: "100%" }}>{SUBJ.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="label">Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...field, width: "100%" }} /></label>
          <label className="label">Title (short)<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${subject} assessment`} style={{ ...field, width: "100%" }} /></label>
          <label className="label">Total marks<input value={marks} onChange={(e) => setMarks(e.target.value.replace(/\D/g, ""))} style={{ ...field, width: "100%" }} /></label>
        </div>
        {time && <small className="label">{time.start ? `From your timetable (Week ${time.week}): ${time.start}–${time.end}${time.room ? `, room ${time.room}` : ""}` : `No ${subject} lesson that day (Week ${time.week}). You can set the time on the test page.`}</small>}
        <span className="label">Chapters on the test</span>
        <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
          {maps.map((m) => <button key={m.id} className="pill" data-active={chapters.has(m.chapter)} onClick={() => { const s = new Set(chapters); if (s.has(m.chapter)) s.delete(m.chapter); else s.add(m.chapter); setChapters(s); }} title={(m.spec_codes ?? []).join(", ")}>{m.chapter} {m.label}</button>)}
          {!maps.length && <small className="label">No chapters mapped for {subject} yet: add topics on the test page, or tell Apollo what each chapter covers.</small>}
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (e.g. calculator allowed, bring formula book)" style={{ ...field, height: "auto", padding: 8 }} />
        {err && <div style={{ color: "var(--danger)" }}>{err}</div>}
        <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => {
          if (!date) { setErr("Pick a date."); return; }
          const r = await post({ action: "create", subject, date, title: title || `${subject} assessment`, chapters: [...chapters], total_marks: marks ? Number(marks) : undefined, notes: notes || undefined });
          if (r.error) setErr(r.error); else onSaved(r.id);
        }}>Add test</button>
        <small className="label">Reminders are made automatically (7, 3 and 1 day before, and the morning of).</small>
      </div>
    </div>
  );
}
