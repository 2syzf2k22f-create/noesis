"use client";
// Fitness > Routines: header stats, week strip from the timetable, routine cards (tidy exercise lists with
// last weight + trend), filters, Start / Edit / Duplicate / Delete / Schedule, next up, weekly volume per
// muscle group, recent sessions, PRs, a structured editor (rows, drag to reorder, paste as text),
// "Build with Apollo", and a full-screen workout logger with rest timer, overload hints and a summary.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
/** Overlays go straight under <body>: the page content sits in a lower stacking layer than the top bar. */
const Portal = ({ children }: { children: React.ReactNode }) => (typeof document === "undefined" ? null : createPortal(children, document.body));
import { useApollo } from "@/shell/apollo";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
type Item = { name: string; sets?: number; reps?: string; rest?: number; notes?: string; note?: boolean };
const SPLITS = ["upper", "lower", "push", "pull", "legs", "core", "full body", "other"];
const SPLIT_COLOR: Record<string, string> = { upper: "#5b8def", lower: "#30a46c", push: "#e5484d", pull: "#8e4ec6", legs: "#f5a524", core: "#12a594", "full body": "#d6409f", other: "#888" };
const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const post = (body: object) => fetch("/api/fitness/routines", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const field: React.CSSProperties = { height: 32, padding: "0 8px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "13px var(--font-body)", minWidth: 0 };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : "never");
const isCompound = (n: string) => /bench|squat|deadlift|press|row|pulldown|pull-?up|lunge|thrust|dip|chin/i.test(n);

export function RoutinesPage() {
  const { changes, submit } = useApollo();
  const [d, setD] = useState<A>(null);
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState<A | null>(null);
  const [build, setBuild] = useState(false);
  const [sched, setSched] = useState<A | null>(null);
  const [run, setRun] = useState<A | null>(null);
  const [tick, setTick] = useState(0);
  const load = () => fetch("/api/fitness/routines").then((r) => (r.ok ? r.json() : { error: true })).then(setD).catch(() => setD({ error: true }));
  useEffect(() => { void load(); }, [changes, tick]);
  const reload = () => setTick((t) => t + 1);
  if (!d) return <div className="label">Loading…</div>;
  if (d.error) return <div className={u.nodata}>Couldn&apos;t load routines (database not connected?).</div>;
  const today = (new Date().getDay() + 6) % 7 + 1;
  const shown = d.routines.filter((r: A) => filter === "all" || r.split === filter || (filter === "legs" && r.split === "lower") || (filter === "core" && r.muscles.includes("core")));
  const byDay = (day: number) => d.routines.flatMap((r: A) => r.schedule.filter((sc: A) => sc.day === day).map((sc: A) => ({ r, sc })));
  const nextR = d.next ? d.routines.find((r: A) => r.id === d.next.routine) : null;

  return (
    <div style={{ display: "grid", gap: 14 }} data-routines>
      {/* 1. header strip */}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 8 }}>
        <button className="pill" data-active="true" onClick={() => setEdit({ name: "", split: "upper", items: [{ name: "", sets: 3, reps: "8-12" }] })}>＋ New routine</button>
        <button className="pill" onClick={() => setBuild(true)}>✨ Build with Apollo</button>
        <button className="pill" onClick={() => { const r = nextR ?? d.routines[0]; if (r) setRun(r); }} disabled={!d.routines.length}>▶ Start workout</button>
        <span style={{ flex: 1 }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, auto))", gap: "4px 16px", flex: "1 1 320px", justifyContent: "end" }}>
        {[[d.stats.routines, "routines"], [d.stats.sessions_week, "sessions this week"], [when(d.stats.last_trained), "last trained"], [`${d.stats.volume_week.toLocaleString("en-GB")} kg`, "volume this week"]].map(([v, l]) => (
          <span key={String(l)} style={{ display: "grid", textAlign: "right" }}><b style={{ fontSize: 17 }}>{v}</b><small className="label">{l}</small></span>
        ))}
        </div>
      </div>
      {d.deload && <div className="pill" style={{ justifySelf: "start", background: "#f5a52433" }}>Deload week: same exercises, about 60% of your usual weight and sets.</div>}

      {/* 2. week strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(96px, 1fr))", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
        {DAY.map((name, i) => {
          const items = byDay(i + 1);
          return (
            <div key={name} style={{ padding: "8px 6px", borderRadius: 10, background: i + 1 === today ? "color-mix(in srgb, var(--accent) 18%, var(--surface))" : "var(--surface)", border: i + 1 === today ? "1px solid var(--accent)" : "1px solid var(--border)", display: "grid", gap: 4, minWidth: 0 }}>
              <small className="label">{name}{i + 1 === today ? " · today" : ""}</small>
              {items.length ? items.map(({ r, sc }: A) => (
                <button key={sc.id} onClick={() => document.getElementById(`routine-${r.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} title={r.name}
                  style={{ textAlign: "left", border: 0, borderLeft: `3px solid ${SPLIT_COLOR[r.split] ?? "#888"}`, background: "none", color: "var(--text)", padding: "0 0 0 6px", cursor: "pointer", font: "12px var(--font-body)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <b>{sc.start}</b> {short(r.name)}
                </button>
              )) : <small className="label">Rest</small>}
            </div>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14 }}>
        {/* 3. routine cards */}
        <div style={{ display: "grid", gap: 10, gridColumn: "span 2", minWidth: 0 }} data-cards>
          <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
            {["all", "upper", "lower", "push", "pull", "legs", "core"].map((f) => <button key={f} className="pill" data-active={filter === f} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}
          </div>
          {shown.length === 0 && <div className={u.nodata}>{d.routines.length ? "No routines match." : "No routines yet: press New routine or Build with Apollo."}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: 10 }}>
            {shown.map((r: A) => (
              <article key={r.id} id={`routine-${r.id}`} style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", gap: 8, alignContent: "start", minWidth: 0 }}>
                <div className={u.row} style={{ alignItems: "flex-start", gap: 6 }}>
                  <b style={{ flex: 1, fontSize: 15 }}>{r.name}</b>
                  <span className="pill" style={{ background: `${SPLIT_COLOR[r.split] ?? "#888"}33`, borderColor: SPLIT_COLOR[r.split] }}>{r.split}</span>
                </div>
                <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
                  {r.muscles.map((m: string) => <small key={m} className="pill" style={{ height: 20, fontSize: 11 }}>{m}</small>)}
                  <small className="label" style={{ marginLeft: "auto" }}>≈{r.minutes} min · {r.total_sets} sets</small>
                </div>
                <small className="label">{r.schedule.length ? r.schedule.map((sc: A) => `${DAY[sc.day - 1]} ${sc.start}`).join(" · ") : "Not scheduled"}{r.last_done ? ` · last done ${when(r.last_done)}` : ""}</small>
                <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 3 }}>
                  {r.items.map((i: A, k: number) => i.note ? (
                    <li key={k} style={{ fontSize: 12.5, color: "var(--text-dim)", fontStyle: "italic" }}>{i.name}</li>
                  ) : (
                    <li key={k} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 6, fontSize: 13, padding: "3px 0", borderTop: k ? "1px solid var(--border)" : undefined }}>
                      <span style={{ minWidth: 0 }}>{i.name}{i.notes && <small className="label"> · {i.notes}</small>}{i.history?.add_weight && <small style={{ color: "var(--good)" }}> · add weight → {i.history.add_weight} kg</small>}</span>
                      <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                        <b>{i.sets}×{i.reps}</b>
                        {i.history?.last_weight != null && <small className="label"> · {i.history.last_weight} kg {i.history.trend === "up" ? "▲" : i.history.trend === "down" ? "▼" : i.history.trend === "flat" ? "▬" : ""}</small>}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
                  <button className="pill" data-active="true" onClick={() => setRun(r)}>▶ Start</button>
                  <button className="pill" onClick={() => setEdit({ id: r.id, name: r.name, split: r.split, items: r.items.map(({ history: _h, muscles: _m, ...rest }: A) => rest) })}>✎ Edit</button>
                  <button className="pill" onClick={() => setSched(r)}>🗓 Schedule</button>
                  <button className="pill" onClick={async () => { await post({ action: "duplicate", id: r.id }); reload(); }}>⎘ Duplicate</button>
                  <button className="pill" onClick={async () => { if (confirm(`Delete "${r.name}"? It goes to the trash and can be restored.`)) { await post({ action: "delete", id: r.id }); reload(); } }}>🗑</button>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* 4. right column */}
        <aside style={{ display: "grid", gap: 12, alignContent: "start", minWidth: 0 }}>
          <section style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 6 }}>
            <span className="label">Next up</span>
            {nextR ? <>
              <b>{nextR.name}</b>
              <small className="label">{d.next.inDays === 0 ? "Today" : d.next.inDays === 1 ? "Tomorrow" : DAY[d.next.day - 1]} at {d.next.start} · ≈{nextR.minutes} min</small>
              <button className="pill" data-active="true" style={{ height: 44, fontSize: 16 }} onClick={() => setRun(nextR)}>▶ Start {short(nextR.name)}</button>
            </> : <small className="label">Nothing scheduled. Use Schedule on a routine.</small>}
          </section>
          <section style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 6 }}>
            <span className="label">Sets per muscle, last 7 days (line = target)</span>
            {d.muscle_volume.map((m: A) => {
              const max = Math.max(16, ...d.muscle_volume.map((x: A) => Math.max(x.sets, x.target_sets)));
              return (
                <div key={m.muscle} data-tip={`${m.muscle}: ${m.sets} sets, ${m.volume.toLocaleString("en-GB")} kg (target ${m.target_sets} sets)`} style={{ display: "grid", gridTemplateColumns: "70px 1fr 28px", gap: 6, alignItems: "center", fontSize: 12 }}>
                  <span>{m.muscle}</span>
                  <div style={{ position: "relative", height: 10, borderRadius: 5, background: "var(--surface-2)" }}>
                    <div style={{ width: `${(m.sets / max) * 100}%`, height: "100%", borderRadius: 5, background: m.sets >= m.target_sets ? "#30a46c" : m.sets >= m.target_sets / 2 ? "#e2c044" : "#e5484d" }} />
                    <i style={{ position: "absolute", top: -2, bottom: -2, left: `${(m.target_sets / max) * 100}%`, width: 2, background: "var(--text)" }} />
                  </div>
                  <b>{m.sets}</b>
                </div>
              );
            })}
          </section>
          <section style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 4 }}>
            <span className="label">Recent sessions</span>
            {d.sessions.length ? d.sessions.slice(0, 6).map((x: A) => <div key={x.id} className={u.row} style={{ fontSize: 12.5 }}><span style={{ flex: 1 }}>{when(x.at)} · {short(x.routine ?? "workout")}</span><small className="label">{x.volume.toLocaleString("en-GB")} kg{x.minutes ? ` · ${x.minutes} min` : ""}</small></div>) : <small className="label">No sessions yet. Press Start on a routine.</small>}
          </section>
          <section style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 4 }}>
            <span className="label">Personal records</span>
            {d.prs.length ? d.prs.map((p: A) => <div key={p.exercise} className={u.row} style={{ fontSize: 12.5 }}><span style={{ flex: 1 }}>{p.exercise}</span><b>{p.weight_kg} kg × {p.reps}</b><small className="label">e1RM {p.e1rm}</small></div>) : <small className="label">Records appear as you log sets.</small>}
          </section>
        </aside>
      </div>

      {edit && <Editor init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {build && <Builder focus={d.focus} onClose={() => setBuild(false)} onGo={(p) => { submit(p); setBuild(false); }} />}
      {sched && <Scheduler r={sched} onClose={() => setSched(null)} onSaved={() => { setSched(null); reload(); }} />}
      {run && <Workout r={run} deload={d.deload} onClose={() => { setRun(null); reload(); }} />}
    </div>
  );
}
const short = (n: string) => n.replace(/^day \d+\s*[-–]\s*/i, "").replace(/\s*\(.*\)\s*$/, "");

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <Portal><div role="dialog" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: `min(${wide ? 820 : 560}px, 100%)`, maxHeight: "92vh", overflow: "auto", padding: 16, display: "grid", gap: 10, background: "var(--bg)" }}>
        <div className={u.row}><b style={{ flex: 1 }}>{title}</b><button className="pill" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div></Portal>
  );
}

/* structured editor: rows, drag to reorder, paste as text */
function Editor({ init, onClose, onSaved }: { init: A; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(init.name);
  const [split, setSplit] = useState(init.split ?? "upper");
  const [items, setItems] = useState<Item[]>(init.items ?? []);
  const [paste, setPaste] = useState<string | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const drag = useRef<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "exercises", limit: 500 }] }) }).then((r) => r.json()).then((j) => setNames([...new Set(((j?.[0]?.rows ?? []) as A[]).map((e) => e.name))].sort())).catch(() => {}); }, []);
  const upd = (k: number, p: Partial<Item>) => setItems(items.map((i, j) => (j === k ? { ...i, ...p } : i)));
  return (
    <Modal title={init.id ? "Edit routine" : "New routine"} onClose={onClose} wide>
      <div className={u.row} style={{ flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. Upper A (chest and arms)" style={{ ...field, flex: "1 1 240px" }} />
        <select value={split} onChange={(e) => setSplit(e.target.value)} style={field}>{SPLITS.map((x) => <option key={x}>{x}</option>)}</select>
      </div>
      <datalist id="exercise-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      {paste == null ? <>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 3fr) 56px 80px 64px minmax(0, 2fr) 28px", gap: 4, fontSize: 11 }} className="label"><span /><span>Exercise</span><span>Sets</span><span>Reps</span><span>Rest s</span><span>Notes</span><span /></div>
          {items.map((i, k) => (
            <div key={k} draggable onDragStart={() => { drag.current = k; }} onDragOver={(e) => e.preventDefault()} onDrop={() => { const from = drag.current; if (from == null || from === k) return; const n = [...items]; const [m] = n.splice(from, 1); n.splice(k, 0, m); setItems(n); drag.current = null; }}
              style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 3fr) 56px 80px 64px minmax(0, 2fr) 28px", gap: 4, alignItems: "center" }}>
              <span title="Drag to reorder" style={{ cursor: "grab", color: "var(--text-dim)" }}>⠿</span>
              <input list="exercise-names" value={i.name} onChange={(e) => upd(k, { name: e.target.value })} placeholder={i.note ? "Note, e.g. 10 min cardio" : "Exercise"} style={field} />
              {i.note ? <span style={{ gridColumn: "span 4" }} className="label">note line</span> : <>
                <input type="number" min={1} max={20} value={i.sets ?? ""} onChange={(e) => upd(k, { sets: Number(e.target.value) })} style={field} />
                <input value={i.reps ?? ""} onChange={(e) => upd(k, { reps: e.target.value })} placeholder="8-12" style={field} />
                <input type="number" min={0} step={15} value={i.rest ?? ""} onChange={(e) => upd(k, { rest: e.target.value ? Number(e.target.value) : undefined })} placeholder={isCompound(i.name) ? "120" : "90"} style={field} />
                <input value={i.notes ?? ""} onChange={(e) => upd(k, { notes: e.target.value })} placeholder="Notes" style={field} />
              </>}
              <button className="pill" onClick={() => setItems(items.filter((_, j) => j !== k))} aria-label="Remove" style={{ padding: 0, width: 28 }}>✕</button>
            </div>
          ))}
        </div>
        <div className={u.row} style={{ flexWrap: "wrap" }}>
          <button className="pill" onClick={() => setItems([...items, { name: "", sets: 3, reps: "8-12" }])}>＋ Exercise</button>
          <button className="pill" onClick={() => setItems([...items, { name: "", note: true }])}>＋ Note</button>
          <button className="pill" onClick={() => setPaste(items.map((i) => (i.note ? i.name : `${i.name} ${i.sets}x${i.reps}`)).join("\n"))}>Paste as text</button>
        </div>
      </> : (
        <div style={{ display: "grid", gap: 6 }}>
          <small className="label">One per line, e.g. &ldquo;Bench press 4x8-10&rdquo;. Lines without sets×reps become notes.</small>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={10} style={{ ...field, height: "auto", padding: 8 }} />
          <button className="pill" style={{ justifySelf: "start" }} onClick={() => {
            setItems(paste.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => { const m = /^(.*?)\s+(\d+)\s*[x×]\s*(.+)$/i.exec(line); return m ? { name: m[1], sets: Number(m[2]), reps: m[3] } : { name: line, note: true }; }));
            setPaste(null);
          }}>Use these</button>
        </div>
      )}
      {err && <div style={{ color: "var(--danger)" }}>{err}</div>}
      <div className={u.row}><button className="pill" data-active="true" onClick={async () => { if (!name.trim()) { setErr("Give it a name."); return; } const r = await post({ action: "save", id: init.id, name, split, items }); if (r.error) setErr(r.error); else onSaved(); }}>Save routine</button><button className="pill" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

/* Build with Apollo: one compact form, Apollo shows a preview before saving */
function Builder({ focus, onClose, onGo }: { focus: string | null; onClose: () => void; onGo: (p: string) => void }) {
  const [f, setF] = useState({ split: "upper", goal: "aesthetics / hypertrophy", days: "4", minutes: "60", equipment: "gym: dumbbells, cables, machines", focus: focus ?? "chest, arms and core" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Build a routine with Apollo" onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        <label className="label">Split<select value={f.split} onChange={set("split")} style={{ ...field, width: "100%" }}>{SPLITS.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="label">Goal<select value={f.goal} onChange={set("goal")} style={{ ...field, width: "100%" }}>{["aesthetics / hypertrophy", "strength", "general fitness", "athletic / sport"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="label">Days per week<input value={f.days} onChange={set("days")} style={{ ...field, width: "100%" }} /></label>
        <label className="label">Minutes<input value={f.minutes} onChange={set("minutes")} style={{ ...field, width: "100%" }} /></label>
        <label className="label" style={{ gridColumn: "1 / -1" }}>Equipment<input value={f.equipment} onChange={set("equipment")} style={{ ...field, width: "100%" }} /></label>
        <label className="label" style={{ gridColumn: "1 / -1" }}>Focus areas<input value={f.focus} onChange={set("focus")} style={{ ...field, width: "100%" }} /></label>
      </div>
      <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={() => onGo(`Design a ${f.split} gym routine for me. Goal: ${f.goal}. ${f.days} days a week, about ${f.minutes} minutes a session. Equipment: ${f.equipment}. Focus: ${f.focus}. Use my profile facts and existing routines/PRs. FIRST show me a preview (name, split, each exercise as "Name sets×reps, rest", why) and ask if I want it saved; only after I say yes, save it to the routines table with name, split, day (same as split) and items (JSON array of {name, sets, reps, rest}) plus exercises (the same, one per line).`)}>Design it</button>
      <small className="label">Apollo shows you a preview in chat first and only saves it when you say yes.</small>
    </Modal>
  );
}

/* schedule: days + time -> timetable rows (both weeks unless chosen) */
function Scheduler({ r, onClose, onSaved }: { r: A; onClose: () => void; onSaved: () => void }) {
  const [days, setDays] = useState<Set<number>>(new Set(r.schedule.map((s: A) => s.day)));
  const [time, setTime] = useState(r.schedule[0]?.start ?? "16:30");
  const [week, setWeek] = useState<string>(r.schedule[0]?.week ?? "both");
  return (
    <Modal title={`Schedule ${short(r.name)}`} onClose={onClose}>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>{DAY.map((n, i) => <button key={n} className="pill" data-active={days.has(i + 1)} onClick={() => { const s = new Set(days); if (s.has(i + 1)) s.delete(i + 1); else s.add(i + 1); setDays(s); }}>{n}</button>)}</div>
      <div className={u.row} style={{ flexWrap: "wrap" }}>
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={field} />
        {["both", "A", "B"].map((w) => <button key={w} className="pill" data-active={week === w} onClick={() => setWeek(w)}>{w === "both" ? "Both weeks" : `Week ${w} only`}</button>)}
      </div>
      <small className="label">Writes timetable rows (replacing this routine&apos;s current slots), so it shows on the week strip, Timetable and Next up.</small>
      <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => { await post({ action: "schedule", id: r.id, slots: [...days].sort().map((day) => ({ day, start: time, week: week === "both" ? null : week })) }); onSaved(); }}>Save schedule</button>
    </Modal>
  );
}

/* full-screen workout logger */
function Workout({ r, deload, onClose }: { r: A; deload: boolean; onClose: () => void }) {
  const ex = useMemo(() => (r.items as A[]).filter((i) => !i.note), [r]);
  const [wid, setWid] = useState<string | null>(null);
  const [k, setK] = useState(0);
  const [done, setDone] = useState<Record<number, { w: number; r: number }[]>>({});
  const startW = (i: number) => { const h = ex[i]?.history; const w = h?.add_weight ?? h?.last_weight ?? 0; return deload ? Math.round(w * 0.6 / 2.5) * 2.5 : w; };
  const startR = (i: number) => { const h = ex[i]?.history; return h?.last?.[0]?.reps ?? (Number(String(ex[i]?.reps ?? "").match(/\d+/)?.[0]) || 8); };
  const [w, setW] = useState(() => startW(0));
  const [reps, setReps] = useState(() => startR(0));
  const [rest, setRest] = useState<{ until: number; total: number } | null>(null);
  const [now, setNow] = useState(0);
  const [summary, setSummary] = useState<A | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void post({ action: "start", routine: r.name }).then((j) => setWid(j.id)); }, [r.name]);
  useEffect(() => { if (!rest) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [rest]);
  const left = rest ? Math.max(0, Math.ceil((rest.until - now) / 1000)) : 0;
  useEffect(() => { if (rest && left === 0 && now) { try { navigator.vibrate?.(300); } catch {} queueMicrotask(() => setRest(null)); } }, [left, rest, now]);
  const e = ex[k];
  const planned = ex.reduce((a: number, i: A) => a + (deload ? Math.max(1, Math.round((i.sets ?? 3) * 0.6)) : i.sets ?? 3), 0);
  const total = Object.values(done).reduce((a, x) => a + x.length, 0);
  const goto = (i: number) => { setK(i); setW(startW(i)); setReps(startR(i)); };
  const logSet = async () => {
    if (!e || busy) return;
    setBusy(true);
    await post({ action: "log_set", workout_id: wid, routine: r.name, exercise: e.name, weight_kg: w, reps });
    const n = { ...done, [k]: [...(done[k] ?? []), { w, r: reps }] };
    setDone(n); setBusy(false);
    const secs = e.rest ?? (isCompound(e.name) ? 120 : 90);
    setRest({ until: Date.now() + secs * 1000, total: secs }); setNow(Date.now());
    const target = deload ? Math.max(1, Math.round((e.sets ?? 3) * 0.6)) : e.sets ?? 3;
    if (n[k].length >= target && k < ex.length - 1) goto(k + 1);
  };
  const finish = async () => {
    const j = wid ? await post({ action: "finish", id: wid }) : {};
    const prs = ex.flatMap((x: A, i: number) => (done[i] ?? []).filter((s) => x.history?.best_e1rm != null && s.w * (1 + s.r / 30) > x.history.best_e1rm).slice(0, 1).map((s) => `${x.name}: ${s.w} kg × ${s.r}`));
    setSummary({ ...j, prs, planned, total });
  };
  const box: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 300, background: "var(--bg)", display: "grid", gridTemplateRows: "auto 1fr auto", padding: "16px max(16px, 4vw)", gap: 12, overflowY: "auto" };
  if (summary) return (
    <Portal><div style={box} role="dialog" aria-label="Workout summary">
      <b style={{ fontSize: 20 }}>{short(r.name)}: done</b>
      <div style={{ display: "grid", gap: 10, alignContent: "start", fontSize: 15 }}>
        <div>Sets: <b>{summary.total}</b> of {summary.planned} planned</div>
        <div>Volume: <b>{Math.round(summary.volume ?? 0).toLocaleString("en-GB")} kg</b>{summary.minutes ? ` · ${summary.minutes} min` : ""}</div>
        <div>New PRs: {summary.prs.length ? summary.prs.map((p: string) => <div key={p}>🏆 {p}</div>) : <span className="label">none this time</span>}</div>
        <small className="label">Your sets are already on Fitness › Log and Progress.</small>
      </div>
      <button className="pill" data-active="true" style={{ height: 48, display: "flex", justifyContent: "center", alignItems: "center", fontSize: 16 }} onClick={onClose}>Close</button>
    </div></Portal>
  );
  return (
    <Portal><div style={box} role="dialog" aria-label="Workout">
      <div style={{ display: "grid", gap: 6 }}>
        <div className={u.row}><b style={{ flex: 1, fontSize: 18 }}>{short(r.name)}{deload ? " · deload" : ""}</b><button className="pill" onClick={finish}>Finish</button><button className="pill" onClick={() => { if (!total || confirm("Leave without finishing? Logged sets are kept.")) { if (wid) void post({ action: "finish", id: wid }); onClose(); } }}>✕</button></div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--surface-2)" }}><div style={{ width: `${Math.min(100, (total / Math.max(1, planned)) * 100)}%`, height: "100%", borderRadius: 4, background: "var(--accent)" }} /></div>
        <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>{ex.map((x: A, i: number) => <button key={i} className="pill" data-active={i === k} onClick={() => goto(i)} style={{ height: 24, fontSize: 11 }}>{(done[i]?.length ?? 0) >= (x.sets ?? 3) ? "✓ " : ""}{x.name.split(" ").slice(0, 2).join(" ")}</button>)}</div>
      </div>
      {e && (
        <div style={{ display: "grid", gap: 14, alignContent: "center", justifyItems: "center", textAlign: "center" }}>
          <div><b style={{ fontSize: 24 }}>{e.name}</b><div className="label">{e.sets}×{e.reps}{e.notes ? ` · ${e.notes}` : ""} · set {(done[k]?.length ?? 0) + 1} of {e.sets}</div></div>
          {e.history?.add_weight && !deload && <div className="pill" style={{ background: "#30a46c33" }}>You hit the top of the range last time: add weight today → {e.history.add_weight} kg</div>}
          {e.history?.last?.length ? <small className="label">Last time: {e.history.last.map((s: A) => `${s.weight_kg}×${s.reps}`).join(", ")}</small> : <small className="label">First time logging this</small>}
          {[["Weight (kg)", w, setW, 2.5], ["Reps", reps, setReps, 1]].map(([label, v, set, step]) => (
            <div key={String(label)} style={{ display: "grid", gap: 4, justifyItems: "center" }}>
              <small className="label">{String(label)}</small>
              <div className={u.row} style={{ gap: 10 }}>
                <button className="pill" style={{ width: 56, height: 56, fontSize: 24 }} onClick={() => (set as (n: number) => void)(Math.max(0, Math.round(((v as number) - (step as number)) * 10) / 10))}>−</button>
                <b style={{ fontSize: 40, minWidth: 110, fontVariantNumeric: "tabular-nums" }}>{v as number}</b>
                <button className="pill" style={{ width: 56, height: 56, fontSize: 24 }} onClick={() => (set as (n: number) => void)(Math.round(((v as number) + (step as number)) * 10) / 10)}>+</button>
              </div>
            </div>
          ))}
          {(done[k] ?? []).length > 0 && <small className="label">Done: {(done[k] ?? []).map((s) => `${s.w}×${s.r}`).join(", ")}</small>}
        </div>
      )}
      <div style={{ display: "grid", gap: 8 }}>
        {rest ? (
          <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
            <b style={{ fontSize: 30, fontVariantNumeric: "tabular-nums" }}>Rest {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</b>
            <div className={u.row}><button className="pill" onClick={() => setRest({ ...rest, until: rest.until + 30000 })}>+30 s</button><button className="pill" onClick={() => setRest(null)}>Skip rest</button></div>
          </div>
        ) : null}
        <button className="pill" data-active="true" style={{ height: 56, fontSize: 18, justifyContent: "center", display: "flex", alignItems: "center" }} disabled={!wid || busy} onClick={logSet}>{busy ? "Saving…" : "Log set"}</button>
      </div>
    </div></Portal>
  );
}
