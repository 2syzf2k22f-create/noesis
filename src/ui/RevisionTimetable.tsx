"use client";
// The revision timetable: a week grid of revision sessions around lessons, workouts, events, tests and
// homework. Make it yourself (click a free slot, drag to move) or generate it from everything School knows,
// and it keeps itself honest: done work ticks itself off, missed sessions move to the next free slot, and
// topics you're ahead on get lighter. Each session says why it's there and starts the right activity.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApollo } from "@/shell/apollo";
import { RoomChat } from "./RoomChat";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics"];
const COLOR: Record<string, string> = { Maths: "#3ee0ff", "Further Maths": "#9b8cff", Physics: "#f5a524", Economics: "#30a46c" };
const METHODS: [string, string][] = [["lesson", "Learn (lesson)"], ["questions", "Practice questions"], ["exam", "Exam questions"], ["past paper", "Past paper"], ["flashcards", "Flashcards"], ["blurt", "Blurt"], ["reviews", "Due reviews"], ["homework", "Homework"], ["notes", "Make notes"], ["reading", "Reading"]];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const H0 = 7, H1 = 22, PX = 46; // 07:00-22:00, px per hour
const api = (b: object) => fetch("/api/revision", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const mins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const hm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const mondayOf = (d: Date) => iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - ((d.getDay() + 6) % 7) * 864e5));
const addD = (d: string, n: number) => iso(new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5));
const field: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" };
const todayIso = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

export function RevisionTimetable() {
  const router = useRouter();
  const { changes } = useApollo();
  const [from, setFrom] = useState(() => mondayOf(new Date()));
  const [d, setD] = useState<A>(null);
  const [tick, setTick] = useState(0);
  const [sel, setSel] = useState<A | null>(null);
  const [adding, setAdding] = useState<{ date: string; start: string } | null>(null);
  const [gen, setGen] = useState(false);
  const [msg, setMsg] = useState("");
  const [view, setView] = useState<"week" | "list">("week");
  const [chatId, setChatId] = useState<string | null>(null);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => { fetch(`/api/revision?from=${from}`).then((r) => r.json()).then(setD).catch(() => {}); }, [from, tick, changes]);
  useEffect(() => { fetch("/api/chats?space=plan:").then((r) => r.json()).then((j) => { if (Array.isArray(j) && j[0]) setChatId(j[0].id); }).catch(() => {}); }, []);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addD(from, i)), [from]);
  if (!d) return <div className="label">Loading your timetable…</div>;
  const t0 = todayIso();
  const next = d.sessions.find((p: A) => p.status === "planned" && (p.date > t0 || (p.date === t0 && (!p.end_time || p.end_time > new Date().toTimeString().slice(0, 5)))));
  const start = (p: A) => {
    void api({ action: "update", id: p.id, status: "planned", log: false });
    const enc = (x: string) => encodeURIComponent(x);
    const go = {
      lesson: `/s/school/tutor?new=${enc(`${p.subject}|${p.spec_code ?? p.topic}|teach`)}&plan=${p.id}`,
      questions: `/s/school/tutor?new=${enc(`${p.subject}|${p.spec_code ?? p.topic}|exam`)}&plan=${p.id}`,
      exam: `/s/school/tutor?new=${enc(`${p.subject}|${p.spec_code ?? p.topic}|exam`)}&plan=${p.id}`,
      blurt: `/s/school/tutor?new=${enc(`${p.subject}|${p.spec_code ?? p.topic}|revise`)}&plan=${p.id}`,
      "past paper": "/s/school/papers", flashcards: `/s/review?review=${enc(`school::${p.subject ?? ""}`)}`, reviews: "/s/review?review=all", homework: "/s/school/homework", notes: "/s/school/notes",
    }[String(p.method) as "lesson"] ?? `/s/school/tutor?new=${enc(`${p.subject}|${p.spec_code ?? p.topic}|revise`)}&plan=${p.id}`;
    router.push(go);
  };
  const drop = async (e: React.DragEvent, date: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain"); if (!id) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const m = Math.round(((e.clientY - r.top) / PX) * 60 / 15) * 15 + H0 * 60;
    await api({ action: "update", id, date, start_time: hm(Math.max(H0 * 60, Math.min(H1 * 60 - 15, m))) });
    reload();
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button className="pill" onClick={() => setFrom(addD(from, -7))}>◀</button>
        <button className="pill" onClick={() => setFrom(mondayOf(new Date()))}>This week</button>
        <button className="pill" onClick={() => setFrom(addD(from, 7))}>▶</button>
        <b>{new Date(`${from}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – {new Date(`${addD(from, 6)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</b>
        <span style={{ flex: 1 }} />
        <button className="pill" data-active={view === "week"} onClick={() => setView("week")}>Week</button>
        <button className="pill" data-active={view === "list"} onClick={() => setView("list")}>List</button>
        <button className="pill" data-active="true" onClick={() => setGen(true)}>⚙ Generate…</button>
        <button className="pill" onClick={async () => { const r = await api({ action: "rebalance" }); setMsg(`Rebalanced: ${r.ticked} ticked off, ${r.missed} missed, ${r.moved} moved, ${r.thinned} lightened.`); reload(); }}>↻ Rebalance</button>
        <a className="pill" href="/api/revision?view=ics" download>📅 Export</a>
        <button className="pill" onClick={() => window.print()}>🖨 Print</button>
      </div>
      {msg && <small className="label">{msg}</small>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
        <Stat k="Planned" v={`${Math.round(d.stats.planned_min / 6) / 10} h`} />
        <Stat k="Done" v={`${Math.round(d.stats.done_min / 6) / 10} h`} />
        <Stat k="Completion" v={d.stats.completion == null ? "–" : `${d.stats.completion}%`} />
        <Stat k="Missed (moved)" v={String(d.stats.missed)} />
        {next && <div style={{ gridColumn: "span 2", padding: 10, borderRadius: 12, background: "var(--surface)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 160 }}><span className="label">Next</span><div><b>{next.subject ? `${next.subject}: ` : ""}{next.topic}</b></div><small className="label">{next.date === t0 ? "today" : new Date(`${next.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short" })} {next.start_time ?? ""} · {next.method}</small></div>
          <button className="pill" data-active="true" onClick={() => start(next)}>▶ Start</button>
        </div>}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{Object.entries(d.stats.by_subject as Record<string, A>).map(([k, v]) => <span key={k} className="label" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 3, background: COLOR[k] ?? "var(--text-dim)", display: "inline-block" }} />{k}: {Math.round(v.done)}/{Math.round(v.planned)} min</span>)}</div>

      {view === "week" ? (
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `44px repeat(7, minmax(110px, 1fr))`, minWidth: 820 }}>
            <div />
            {days.map((dd, i) => (
              <div key={dd} style={{ padding: "4px 6px", fontSize: 12, borderBottom: "1px solid var(--border)", background: dd === t0 ? "color-mix(in srgb, var(--accent) 14%, transparent)" : undefined }}>
                <b>{DAYS[i]} {Number(dd.slice(8))}</b>
                {d.tests.filter((t: A) => t.date === dd).map((t: A) => <div key={t.id} style={{ color: "var(--danger)", fontSize: 11 }}>📝 {t.title}</div>)}
                {d.homework.filter((h: A) => h.due === dd).map((h: A) => <div key={h.id} style={{ fontSize: 11, opacity: 0.8 }}>📚 due: {h.title}</div>)}
              </div>
            ))}
            <div style={{ position: "relative", height: (H1 - H0) * PX }}>{Array.from({ length: H1 - H0 }, (_, i) => <div key={i} style={{ position: "absolute", top: i * PX - 6, right: 4, fontSize: 10, opacity: 0.6 }}>{String(H0 + i).padStart(2, "0")}:00</div>)}</div>
            {days.map((dd) => (
              <div key={dd} onDragOver={(e) => e.preventDefault()} onDrop={(e) => void drop(e, dd)}
                onClick={(e) => { if (e.target !== e.currentTarget) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const m = Math.floor(((e.clientY - r.top) / PX) * 60 / 15) * 15 + H0 * 60; setAdding({ date: dd, start: hm(m) }); }}
                style={{ position: "relative", height: (H1 - H0) * PX, borderLeft: "1px solid var(--border)", backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${PX - 1}px, color-mix(in srgb, var(--border) 60%, transparent) ${PX - 1}px, color-mix(in srgb, var(--border) 60%, transparent) ${PX}px)`, cursor: "copy" }}>
                {(d.busy[dd] ?? []).map((b: A, i: number) => <div key={i} title={b.why} style={{ position: "absolute", left: 2, right: 2, top: ((mins(b.start) - H0 * 60) / 60) * PX, height: Math.max(10, ((mins(b.end) - mins(b.start)) / 60) * PX), background: "repeating-linear-gradient(45deg, color-mix(in srgb, var(--text) 7%, transparent) 0 6px, transparent 6px 12px)", borderRadius: 6, fontSize: 10, padding: "1px 4px", opacity: 0.8, pointerEvents: "none", overflow: "hidden" }}>{b.why}</div>)}
                {d.sessions.filter((p: A) => p.date === dd && p.start_time).map((p: A) => {
                  const top = ((mins(p.start_time) - H0 * 60) / 60) * PX, h = Math.max(18, (Number(p.minutes ?? 45) / 60) * PX - 2);
                  const c = COLOR[p.subject] ?? "#8892b0";
                  return (
                    <div key={p.id} draggable={p.status === "planned"} onDragStart={(e) => e.dataTransfer.setData("text/plain", p.id)} onClick={() => setSel(p)} title={`${p.topic}\n${p.reason ?? ""}`}
                      style={{ position: "absolute", left: 3, right: 3, top, height: h, borderRadius: 7, padding: "2px 6px", fontSize: 11, lineHeight: 1.25, overflow: "hidden", cursor: "pointer", background: `color-mix(in srgb, ${c} ${p.status === "done" ? 55 : 28}%, var(--surface))`, borderLeft: `3px solid ${c}`, opacity: p.status === "missed" ? 0.45 : 1, textDecoration: p.status === "missed" ? "line-through" : undefined }}>
                      <b>{p.status === "done" ? "✓ " : p.status === "partial" ? "◐ " : p.locked ? "🔒 " : ""}{p.subject ?? ""}</b> {p.start_time}<br />{p.topic}{p.method ? <span style={{ opacity: 0.75 }}> · {p.method}</span> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <small className="label">Click an empty slot to add a session · drag a session to move it · striped blocks are lessons, workouts and events.</small>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {days.map((dd, i) => {
            const ss = d.sessions.filter((p: A) => p.date === dd);
            return (
              <div key={dd}>
                <b style={{ fontSize: 13 }}>{DAYS[i]} {Number(dd.slice(8))}</b> <small className="label">{ss.reduce((a: number, p: A) => a + Number(p.minutes ?? 0), 0)} min</small>
                {!ss.length && <div className="label" style={{ fontSize: 12 }}>Nothing planned.</div>}
                {ss.map((p: A) => <div key={p.id} onClick={() => setSel(p)} style={{ display: "flex", gap: 8, padding: "6px 8px", borderRadius: 8, background: "var(--surface)", marginTop: 4, cursor: "pointer", borderLeft: `3px solid ${COLOR[p.subject] ?? "#8892b0"}` }}><span style={{ width: 50 }}>{p.start_time ?? "–"}</span><span style={{ flex: 1 }}><b>{p.subject ?? ""}</b> {p.topic} <small className="label">· {p.method} · {p.minutes} min{p.reason ? ` · ${p.reason}` : ""}</small></span><span>{p.status}</span></div>)}
              </div>
            );
          })}
        </div>
      )}
      <details>
        <summary className="label" style={{ cursor: "pointer" }}>Ask Apollo about your timetable (move things, plan around a trip, catch up after illness…)</summary>
        <div style={{ marginTop: 8 }}>
          <RoomChat space="plan:revision" conversationId={chatId} onConversation={setChatId} mode="chat" height={380}
            context={`Revision timetable page. Use plan_revision (generate/rebalance/add/move/clear) and get_revision_week to change the plan; explain what you changed in 2-3 lines. Week shown: ${from}.`}
            quick={[{ label: "I missed today", text: "I couldn't revise today: move today's sessions sensibly and tell me the new plan." }, { label: "Lighter week", text: "Make next week lighter (max 90 min a day) but keep test topics." }, { label: "Plan for my next test", text: "Re-plan to focus on my next test." }, { label: "Why these topics?", text: "Explain why this week's sessions were chosen." }]} />
        </div>
      </details>
      {sel && <SessionCard p={sel} onClose={() => setSel(null)} onStart={() => start(sel)} onChanged={() => { setSel(null); reload(); }} />}
      {adding && <AddSession at={adding} onClose={() => setAdding(null)} onAdded={() => { setAdding(null); reload(); }} />}
      {gen && <GeneratePanel s={d.settings} onClose={() => setGen(false)} onDone={(r) => { setGen(false); setMsg(`Made ${r.created} sessions (${r.from} to ${r.to}). Top priorities: ${r.top?.slice(0, 3).map((t: A) => `${t.subject} ${t.topic}`).join(", ")}.`); reload(); }} />}
    </div>
  );
}
const Stat = ({ k, v }: { k: string; v: string }) => <div style={{ padding: 10, borderRadius: 12, background: "var(--surface)" }}><span className="label">{k}</span><div style={{ fontSize: 22, fontWeight: 650 }}>{v}</div></div>;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 330, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ background: "var(--bg)", padding: 16, display: "grid", gap: 10, width: "min(560px, 94vw)", maxHeight: "90vh", overflowY: "auto" }}><b style={{ fontSize: 17 }}>{title}</b>{children}</div>
    </div>
  );
}
function SessionCard({ p, onClose, onStart, onChanged }: { p: A; onClose: () => void; onStart: () => void; onChanged: () => void }) {
  const [date, setDate] = useState(p.date), [time, setTime] = useState(p.start_time ?? ""), [m, setM] = useState(p.minutes ?? 45), [method, setMethod] = useState(p.method ?? "questions"), [notes, setNotes] = useState(p.notes ?? "");
  const up = async (b: object) => { await api({ action: "update", id: p.id, ...b }); onChanged(); };
  const [focus, setFocus] = useState(false);
  if (focus) return <FocusTimer p={p} onDone={async (minutes) => { await api({ action: "update", id: p.id, status: minutes >= Number(p.minutes ?? 45) * 0.6 ? "done" : "partial", done_minutes: minutes }); onChanged(); }} onCancel={() => setFocus(false)} />;
  return (
    <Modal title={`${p.subject ? `${p.subject}: ` : ""}${p.topic}`} onClose={onClose}>
      <small className="label">{p.spec_code ? `Spec ${p.spec_code} · ` : ""}{p.status}{p.reason ? ` · why: ${p.reason}` : ""}{p.moved_from ? ` · moved from ${p.moved_from}` : ""}</small>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="pill" data-active="true" onClick={onStart}>▶ Start ({method})</button>
        <button className="pill" onClick={() => setFocus(true)}>⏱ Focus timer</button>
        <button className="pill" onClick={() => void up({ status: "done" })}>✓ Done</button>
        <button className="pill" onClick={() => void up({ status: "partial", done_minutes: Math.round(Number(m) / 2) })}>◐ Half done</button>
        <button className="pill" onClick={() => void up({ status: "missed" })}>✗ Missed (move it)</button>
        <button className="pill" onClick={() => void up({ status: "skipped" })}>Skip</button>
        <button className="pill" onClick={() => void up({ locked: !p.locked })}>{p.locked ? "Unlock" : "🔒 Lock"}</button>
        <button className="pill" onClick={async () => { await api({ action: "delete", id: p.id }); onChanged(); }}>Delete</button>
      </div>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={field} />
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={field} />
        <select value={m} onChange={(e) => setM(Number(e.target.value))} style={field}>{[15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 120].map((x) => <option key={x} value={x}>{x} min</option>)}</select>
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes for this session" rows={2} style={{ ...field, height: "auto", padding: 8 }} />
      <button className="pill" onClick={() => void up({ date, start_time: time || null, minutes: m, method, notes })} style={{ justifySelf: "start" }}>Save changes</button>
    </Modal>
  );
}
function AddSession({ at, onClose, onAdded }: { at: { date: string; start: string }; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ subject: "Maths", topic: "", spec_code: "", method: "questions", minutes: 45, start_time: at.start, date: at.date, locked: true });
  const [sug, setSug] = useState<A[]>([]);
  useEffect(() => { fetch("/api/revision?view=suggest").then((r) => r.json()).then((j) => setSug(Array.isArray(j) ? j : [])).catch(() => {}); }, []);
  return (
    <Modal title={`Add a session · ${new Date(`${at.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}`} onClose={onClose}>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} style={field}>{SUBJ.map((s) => <option key={s}>{s}</option>)}</select>
        <input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} style={field} />
        <select value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} style={field}>{[15, 20, 25, 30, 45, 60, 90].map((x) => <option key={x} value={x}>{x} min</option>)}</select>
        <select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} style={field}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <input value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="Topic" style={field} />
      <input value={f.spec_code} onChange={(e) => setF({ ...f, spec_code: e.target.value })} placeholder="Spec code (optional), e.g. 1.02" style={field} />
      {sug.length > 0 && <><span className="label">Suggested (most needed first)</span><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{sug.slice(0, 10).map((c: A) => <button key={`${c.subject}${c.code}`} className="pill" style={{ height: "auto", minHeight: 26, fontSize: 12 }} title={c.why.join(" · ")} onClick={() => setF({ ...f, subject: c.subject, topic: c.topic, spec_code: c.code ?? "" })}>{c.subject} {c.code} {String(c.topic).slice(0, 28)}</button>)}</div></>}
      <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => { await api({ action: "add", ...f, spec_code: f.spec_code || null }); onAdded(); }}>Add</button>
    </Modal>
  );
}
function GeneratePanel({ s, onClose, onDone }: { s: A; onClose: () => void; onDone: (r: A) => void }) {
  const [o, setO] = useState<A>(() => ({ ...s, availabilityText: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [String(i + 1), (s.availability?.[String(i + 1)] ?? []).map((w: A) => `${w.start}-${w.end}`).join(", ")])) }));
  const [busy, setBusy] = useState(false);
  const parse = () => Object.fromEntries(Object.entries(o.availabilityText as Record<string, string>).map(([k, v]) => [k, v.split(/[,;]/).map((x) => x.trim()).filter(Boolean).map((x) => { const [a, b] = x.split("-").map((y) => y.trim()); return { start: a, end: b }; }).filter((w) => /^\d\d:\d\d$/.test(w.start) && /^\d\d:\d\d$/.test(w.end))]));
  const toggle = (k: string, v: string) => setO({ ...o, [k]: o[k].includes(v) ? o[k].filter((x: string) => x !== v) : [...o[k], v] });
  return (
    <Modal title="Generate a revision timetable" onClose={onClose}>
      <small className="label">Fills your study windows from today, around lessons, workouts and events, with what needs it most: weakest spec topics, topics on upcoming tests (sooner = more), unresolved mistakes, due reviews and anything not touched for a while. Your own and locked sessions are kept.</small>
      <span className="label">Study windows (e.g. 16:30-18:00, 19:00-21:00)</span>
      <div style={{ display: "grid", gap: 4 }}>{DAYS.map((dn, i) => <label key={dn} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 6, alignItems: "center", fontSize: 13 }}>{dn}<input value={o.availabilityText[String(i + 1)]} onChange={(e) => setO({ ...o, availabilityText: { ...o.availabilityText, [String(i + 1)]: e.target.value } })} style={field} /><label className="label" style={{ display: "flex", gap: 4 }}><input type="checkbox" checked={o.rest_days.includes(i + 1)} onChange={() => setO({ ...o, rest_days: o.rest_days.includes(i + 1) ? o.rest_days.filter((x: number) => x !== i + 1) : [...o.rest_days, i + 1] })} />rest</label></label>)}</div>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <label className="label">Session <select value={o.session_min} onChange={(e) => setO({ ...o, session_min: Number(e.target.value) })} style={field}>{[25, 30, 40, 45, 50, 60, 75, 90].map((x) => <option key={x} value={x}>{x} min</option>)}</select></label>
        <label className="label">Break <select value={o.break_min} onChange={(e) => setO({ ...o, break_min: Number(e.target.value) })} style={field}>{[5, 10, 15, 20].map((x) => <option key={x} value={x}>{x} min</option>)}</select></label>
        <label className="label">Max a day <select value={o.max_per_day_min} onChange={(e) => setO({ ...o, max_per_day_min: Number(e.target.value) })} style={field}>{[60, 90, 120, 150, 180, 240, 300, 360].map((x) => <option key={x} value={x}>{x / 60} h</option>)}</select></label>
        <label className="label">Plan ahead <select value={o.days_ahead} onChange={(e) => setO({ ...o, days_ahead: Number(e.target.value) })} style={field}>{[7, 14, 21, 28, 42].map((x) => <option key={x} value={x}>{x} days</option>)}</select></label>
      </div>
      <span className="label">Strategy</span>
      <div className={u.row} style={{ gap: 4, flexWrap: "wrap" }}>{[["balanced", "Balanced"], ["weakest", "Weakest first"], ["tests", "Upcoming tests first"], ["interleaved", "Interleaved (mix subjects)"]].map(([k, l]) => <button key={k} className="pill" data-active={o.strategy === k} onClick={() => setO({ ...o, strategy: k })}>{l}</button>)}</div>
      <span className="label">Subject weighting</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 6 }}>{SUBJ.map((sj) => <label key={sj} className="label" style={{ display: "grid", gap: 2 }}>{sj}: {o.subject_weights[sj] ?? 1}×<input type="range" min={0} max={2} step={0.25} value={o.subject_weights[sj] ?? 1} onChange={(e) => setO({ ...o, subject_weights: { ...o.subject_weights, [sj]: Number(e.target.value) } })} /></label>)}</div>
      <span className="label">Methods to use</span>
      <div className={u.row} style={{ gap: 4, flexWrap: "wrap" }}>{METHODS.filter(([k]) => !["reviews", "homework"].includes(k)).map(([k, l]) => <button key={k} className="pill" data-active={o.methods.includes(k)} onClick={() => toggle("methods", k)}>{l}</button>)}</div>
      <div className={u.row} style={{ gap: 12, flexWrap: "wrap" }}>
        <label className="label" style={{ display: "flex", gap: 4 }}><input type="checkbox" checked={o.include_sr} onChange={(e) => setO({ ...o, include_sr: e.target.checked })} />Daily 15-min reviews</label>
        <label className="label" style={{ display: "flex", gap: 4 }}><input type="checkbox" checked={o.include_homework} onChange={(e) => setO({ ...o, include_homework: e.target.checked })} />Slots for homework before it&apos;s due</label>
      </div>
      <div className={u.row} style={{ gap: 6 }}>
        <button className="pill" data-active="true" disabled={busy} onClick={async () => { setBusy(true); const { availabilityText: _a, ...rest } = o; void _a; const r = await api({ action: "generate", settings: { ...rest, availability: parse() } }); setBusy(false); onDone(r); }}>{busy ? "Planning…" : "Generate"}</button>
        <button className="pill" onClick={async () => { const { availabilityText: _a, ...rest } = o; void _a; await api({ action: "settings", settings: { ...rest, availability: parse() } }); onClose(); }}>Save settings only</button>
        <button className="pill" onClick={async () => { if (confirm("Remove all generated sessions from today on? (Yours and locked ones stay.)")) { await api({ action: "clear" }); onClose(); } }}>Clear generated</button>
      </div>
    </Modal>
  );
}

/** A full-screen focus timer for one session: counts down, pauses, and when it ends (or you end it) the
 *  minutes are logged and the session is ticked off (or marked half done). */
function FocusTimer({ p, onDone, onCancel }: { p: A; onDone: (minutes: number) => void; onCancel: () => void }) {
  const total = Number(p.minutes ?? 45) * 60;
  const [left, setLeft] = useState(total);
  const [paused, setPaused] = useState(false);
  useEffect(() => { if (paused) return; const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000); return () => clearInterval(t); }, [paused]);
  useEffect(() => { if (left === 0) { try { new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=").play().catch(() => {}); } catch {} queueMicrotask(() => onDone(Math.round(total / 60))); } }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const used = Math.round((total - left) / 60);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 330, background: "var(--bg)", display: "grid", placeItems: "center" }}>
      <div style={{ display: "grid", gap: 14, justifyItems: "center", textAlign: "center" }}>
        <span className="label">{p.subject ?? ""} · {p.method}</span>
        <b style={{ fontSize: 22 }}>{p.topic}</b>
        <div style={{ fontSize: "min(22vw, 160px)", fontWeight: 700, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</div>
        <div style={{ width: "min(420px, 80vw)", height: 6, borderRadius: 3, background: "var(--surface-2)" }}><div style={{ height: 6, borderRadius: 3, width: `${((total - left) / total) * 100}%`, background: "var(--accent)" }} /></div>
        <div className={u.row} style={{ gap: 8 }}>
          <button className="pill" onClick={() => setPaused(!paused)}>{paused ? "▶ Resume" : "⏸ Pause"}</button>
          <button className="pill" data-active="true" onClick={() => onDone(Math.max(1, used))}>■ End ({used} min)</button>
          <button className="pill" onClick={onCancel}>Cancel</button>
        </div>
        <small className="label">Phone away. When it ends, the minutes are logged and the session ticks itself off.</small>
      </div>
    </div>
  );
}
