"use client";
// "What should I revise now?", a month calendar, a shopping list from recipes, and body metrics.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useApollo } from "@/shell/apollo";
import type { SubjectAnalysis } from "@/core/schoolAnalysis";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const nowMs = () => Date.now();
async function data(binds: object[]) {
  return fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds }) }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
}

/* ---------- what to revise now ---------- */
export function NextRevise({ ctx }: { ctx: BlockCtx }) {
  const { submit, changes } = useApollo();
  const [picks, setPicks] = useState<{ subject: string; topic: string; pct: number; why: string; score: number }[] | null>(null);
  useEffect(() => {
    Promise.all([fetch("/api/school-analysis").then((r) => (r.ok ? r.json() : null)), data([{ table: "events", where: { kind: "exam" }, limit: 100 }, { table: "study_sessions", days: 60, limit: 500 }])])
      .then(([a, [ex, ss]]) => {
        if (!a) return setPicks([]);
        const exams = ((ex?.rows ?? []) as Row[]).filter((e) => Date.parse(e.at) > nowMs());
        const sessions = (ss?.rows ?? []) as Row[];
        const out: { subject: string; topic: string; pct: number; why: string; score: number }[] = [];
        for (const s of a.subjects as SubjectAnalysis[]) {
          const exam = exams.filter((e) => (e.subject ?? "").toLowerCase() === s.subject.toLowerCase()).sort((x, y) => Date.parse(x.at) - Date.parse(y.at))[0];
          const daysToExam = exam ? (Date.parse(exam.at) - nowMs()) / 864e5 : 120;
          for (const t of s.topics.slice(0, 8)) {
            const last = sessions.filter((x) => (x.topic ?? "").toLowerCase() === t.topic.toLowerCase()).map((x) => Date.parse(x.created_at)).sort((x, y) => y - x)[0];
            const since = last ? (nowMs() - last) / 864e5 : 60;
            // weakness x forgetting x exam urgency
            const score = (100 - t.pct) * Math.min(2, 0.5 + since / 14) * (daysToExam < 30 ? 1.6 : daysToExam < 60 ? 1.25 : 1);
            out.push({ subject: s.subject, topic: t.topic, pct: t.pct, score, why: `${t.pct}% so far · ${last ? `last revised ${Math.round(since)} d ago` : "not revised yet"}${exam ? ` · exam in ${Math.round(daysToExam)} d` : ""}` });
          }
        }
        setPicks(out.sort((x, y) => y.score - x.score).slice(0, 5));
      }).catch(() => setPicks([]));
  }, [changes, ctx.data]);
  if (!picks) return <div className="label">Working it out…</div>;
  if (!picks.length) return <div className="label">Log tests, papers or practice questions with topics, and this will tell you exactly what to revise next.</div>;
  return (
    <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8 }}>
      {picks.map((p, i) => (
        <li key={p.subject + p.topic}>
          <div className={u.row}>
            <b style={{ flex: 1 }}>{p.subject}: {p.topic}</b>
            {i === 0 && <button className="pill" data-active="true" onClick={() => submit(`Teach me ${p.topic} (${p.subject}) step by step aimed at full marks, then give me 3 exam-style questions on it.`, { mode: "tutor", thread: `tutor:${p.subject}` })}>Start with Apollo</button>}
            <Link className="pill" href="/s/school/questions">Practise</Link>
          </div>
          <small className="label">{p.why}</small>
        </li>
      ))}
    </ol>
  );
}

/* ---------- month calendar ---------- */
export function MonthCalendar() {
  const { changes } = useApollo();
  const [off, setOff] = useState(0);
  const [items, setItems] = useState<{ day: string; label: string; kind: string; href: string }[]>([]);
  useEffect(() => {
    data([{ table: "events", limit: 500 }, { table: "homework", where: { status: "to do" }, limit: 200 }, { table: "plan_items", limit: 500 }, { table: "school_tests", limit: 200 }]).then(([ev, hw, pl, st]) => {
      const d = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      setItems([
        ...((ev?.rows ?? []) as Row[]).filter((e) => e.kind !== "lesson").map((e) => ({ day: d(e.at), label: e.title, kind: e.kind ?? "event", href: "/s/school/timetable" })),
        ...((hw?.rows ?? []) as Row[]).filter((h) => h.due_at).map((h) => ({ day: d(h.due_at), label: `Due: ${h.title}`, kind: "homework", href: "/s/school/homework" })),
        ...((pl?.rows ?? []) as Row[]).map((p) => ({ day: String(p.date).slice(0, 10), label: `${p.subject ?? ""} ${p.topic}`.trim(), kind: p.done ? "done" : "plan", href: "/s/school/planner" })),
        ...((st?.rows ?? []) as Row[]).filter((t) => t.date).map((t) => ({ day: String(t.date).slice(0, 10), label: `${t.title} ${Math.round(t.pct)}%`, kind: "test", href: "/s/school/tests" })),
      ]);
    });
  }, [changes]);
  const base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + off);
  const first = (base.getDay() + 6) % 7, daysIn = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const todayKey = new Date().toLocaleDateString("en-CA");
  const color: Record<string, string> = { exam: "#e5484d", deadline: "#f5a524", homework: "#f5a524", test: "#8e4ec6", plan: "var(--accent)", done: "var(--text-dim)", event: "#30a46c", trip: "#30a46c" };
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row}>
        <button className="pill" onClick={() => setOff(off - 1)}>‹</button>
        <b style={{ flex: 1, textAlign: "center" }}>{base.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</b>
        <button className="pill" onClick={() => setOff(0)}>Today</button>
        <button className="pill" onClick={() => setOff(off + 1)}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <small key={x} className="label" style={{ textAlign: "center" }}>{x}</small>)}
        {Array.from({ length: first }, (_, i) => <div key={`b${i}`} />)}
        {Array.from({ length: daysIn }, (_, i) => {
          const key = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
          const its = items.filter((x) => x.day === key);
          return (
            <div key={key} style={{ minHeight: 74, padding: 4, borderRadius: 6, background: "var(--surface)", outline: key === todayKey ? "1px solid var(--accent)" : undefined, display: "grid", alignContent: "start", gap: 2 }}>
              <small style={{ color: "var(--text-dim)" }}>{i + 1}</small>
              {its.slice(0, 3).map((x, k) => <Link key={k} href={x.href} title={x.label} style={{ fontSize: 10.5, lineHeight: 1.25, padding: "1px 4px", borderRadius: 4, borderLeft: `3px solid ${color[x.kind] ?? "var(--accent)"}`, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{x.label}</Link>)}
              {its.length > 3 && <small className="label">+{its.length - 3}</small>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- shopping list from recipes ---------- */
export function ShoppingList({ ctx }: { ctx: BlockCtx }) {
  const recipes = (ctx.data?.rows ?? []) as Row[];
  const [pick, setPick] = useState<Record<string, number>>({});
  const [have, setHave] = useState<Set<string>>(new Set());
  const list = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of recipes) {
      const n = pick[r.id]; if (!n) continue;
      for (const line of String(r.ingredients ?? "").split(/\n|;|,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean)) {
        const name = line.replace(/^[\d½¼¾./\s]+(g|kg|ml|l|tsp|tbsp|cups?|x)?\s*/i, "").toLowerCase() || line.toLowerCase();
        m.set(name, [...(m.get(name) ?? []), `${line}${n > 1 ? ` ×${n}` : ""}`]);
      }
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [recipes, pick]);
  if (!recipes.length) return <div className="label">Save some recipes (with ingredients) to build a shopping list.</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr)", gap: 14 }}>
      <div style={{ display: "grid", gap: 4, alignContent: "start" }}>
        <span className="label">Meals this week</span>
        {recipes.map((r) => (
          <div key={r.id} className={u.row} style={{ fontSize: 13 }}>
            <span style={{ flex: 1 }}>{r.name}</span>
            <button className="pill" onClick={() => setPick({ ...pick, [r.id]: Math.max(0, (pick[r.id] ?? 0) - 1) })}>−</button>
            <b style={{ width: 16, textAlign: "center" }}>{pick[r.id] ?? 0}</b>
            <button className="pill" onClick={() => setPick({ ...pick, [r.id]: (pick[r.id] ?? 0) + 1 })}>+</button>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 4, alignContent: "start" }}>
        <div className={u.row}><span className="label" style={{ flex: 1 }}>Shopping list ({list.length - [...have].filter((h) => list.some(([k]) => k === h)).length} to get)</span>
          {list.length > 0 && <button className="pill" onClick={() => navigator.clipboard?.writeText(list.filter(([k]) => !have.has(k)).map(([, v]) => `- ${v.join(" + ")}`).join("\n"))}>Copy</button>}</div>
        {list.map(([k, v]) => (
          <label key={k} className={u.row} style={{ fontSize: 13, opacity: have.has(k) ? 0.45 : 1, textDecoration: have.has(k) ? "line-through" : undefined }}>
            <input type="checkbox" checked={have.has(k)} onChange={() => { const n = new Set(have); if (n.has(k)) n.delete(k); else n.add(k); setHave(n); }} />
            {v.join(" + ")}
          </label>
        ))}
        {!list.length && <small className="label">Add meals with + to fill the list.</small>}
      </div>
    </div>
  );
}

/* ---------- plan share: what used your Pro plan ---------- */
export function PlanShare({ ctx }: { ctx: BlockCtx }) {
  const rows = (ctx.data?.rows ?? []) as Row[];
  const withPlan = rows.filter((r) => r.plan_7d_delta != null || r.plan_5h_delta != null);
  if (!withPlan.length) return <div className="label">No plan readings yet. After a few Apollo jobs through the relay, this shows how much of your weekly and 5-hour Pro limits each kind of job used, and roughly how many tokens make 1%.</div>;
  const by = new Map<string, { t: number; w: number; h: number; n: number }>();
  for (const r of withPlan) {
    const k = String(r.feature ?? "other").replace(/^apollo\./, "Apollo ");
    const v = by.get(k) ?? { t: 0, w: 0, h: 0, n: 0 };
    v.t += Number(r.tokens_in ?? 0) + Number(r.tokens_out ?? 0); v.w += Number(r.plan_7d_delta ?? 0); v.h += Number(r.plan_5h_delta ?? 0); v.n++;
    by.set(k, v);
  }
  const all = [...by.values()].reduce((a, v) => ({ t: a.t + v.t, w: a.w + v.w, h: a.h + v.h }), { t: 0, w: 0, h: 0 });
  const latest = rows.find((r) => r.plan_7d_pct != null);
  const per1 = all.w > 0 ? Math.round(all.t / all.w) : null;
  const list = [...by.entries()].sort((a, b) => b[1].w - a[1].w);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row}>
        {latest && <span><b style={{ fontSize: 20 }}>{latest.plan_7d_pct}%</b> <span className="label">of your weekly limit used</span></span>}
        {latest?.plan_5h_pct != null && <span><b style={{ fontSize: 20 }}>{latest.plan_5h_pct}%</b> <span className="label">of the current 5-hour session</span></span>}
        {per1 && <span className="label">≈ {per1.toLocaleString("en-GB")} tokens = 1% of your weekly limit (from your own readings)</span>}
      </div>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>{["What", "Jobs", "Tokens", "Weekly limit used", "Share of Apollo's use", "5-hour used"].map((h) => <th key={h} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border)" }}>{h}</th>)}</tr></thead>
        <tbody>{list.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: "4px 6px" }}>{k}</td><td style={{ padding: "4px 6px" }}>{v.n}</td><td style={{ padding: "4px 6px" }}>{v.t.toLocaleString("en-GB")}</td>
            <td style={{ padding: "4px 6px" }}><b>{v.w.toFixed(1)}%</b></td>
            <td style={{ padding: "4px 6px" }}><i style={{ display: "inline-block", width: 80, height: 6, borderRadius: 3, background: `linear-gradient(90deg, var(--accent) ${all.w ? (v.w / all.w) * 100 : 0}%, var(--surface-2) 0)` }} /> {all.w ? Math.round((v.w / all.w) * 100) : 0}%</td>
            <td style={{ padding: "4px 6px" }}>{v.h.toFixed(1)}%</td>
          </tr>
        ))}</tbody>
      </table>
      <small className="label">Percentages come from Claude Code&apos;s own plan readings after each job. Your claude.ai chats and other Claude Code use share the same limits, so some of the weekly % may come from outside NOESIS.</small>
    </div>
  );
}
