"use client";
// "Pick up where you left off": the next timetable session (Start), lessons in progress (resume at the
// right chunk), reviews due, and your latest notes and documents.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApollo } from "@/shell/apollo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
export function ContinueBlock() {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  useEffect(() => {
    const mon = (() => { const x = new Date(); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x.toISOString().slice(0, 10); })();
    Promise.all([
      fetch(`/api/revision?from=${mon}`).then((r) => r.json()).catch(() => null),
      fetch("/api/lessons").then((r) => r.json()).catch(() => []),
      fetch("/api/notes").then((r) => r.json()).catch(() => []),
      fetch("/api/docs").then((r) => r.json()).catch(() => []),
    ]).then(([w, lessons, notes, docs]) => setD({ w, lessons, notes, docs })).catch(() => {});
  }, [changes]);
  if (!d) return <div className="label">Loading…</div>;
  const t0 = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const next = (d.w?.sessions ?? []).find((p: A) => p.status === "planned" && p.date >= t0);
  const active = (Array.isArray(d.lessons) ? d.lessons : []).filter((l: A) => l.status === "active").slice(0, 3);
  const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 10, background: "var(--surface-2)", textDecoration: "none", color: "inherit" };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {next ? <Link href="/s/school/planner" style={row}><span style={{ flex: 1 }}><span className="label">Next session</span><br /><b>{next.subject ? `${next.subject}: ` : ""}{next.topic}</b> <small className="label">{next.date === t0 ? "today" : next.date} {next.start_time ?? ""} · {next.method}</small></span>▶</Link>
        : <Link href="/s/school/planner" style={row}><span style={{ flex: 1 }}>No sessions planned. <b>Generate a revision timetable</b></span>→</Link>}
      {active.map((l: A) => <Link key={l.id} href={`/s/school/tutor?lesson=${l.id}`} style={row}><span style={{ flex: 1 }}><span className="label">Lesson in progress</span><br /><b>{l.topic}</b> <small className="label">{l.subject} · {l.understood}/{l.total} chunks</small></span>Resume →</Link>)}
      {(Array.isArray(d.notes) ? d.notes : []).slice(0, 2).map((n: A) => <Link key={n.id} href={`/s/school/notes?note=${n.id}`} style={row}><span style={{ flex: 1 }}><span className="label">Note</span><br />{n.title}</span>→</Link>)}
      {(Array.isArray(d.docs) ? d.docs : []).slice(0, 1).map((x: A) => <Link key={x.id} href={`/doc/${x.id}`} style={row}><span style={{ flex: 1 }}><span className="label">Document</span><br />{x.title}</span>→</Link>)}
    </div>
  );
}
