"use client";
// Workout plan creator: asks for everything relevant, builds the plan in code (no AI tokens),
// saves it, and turns each day into a routine for Fitness › Log. Apollo can refine it on request.

import { useEffect, useState } from "react";
import { generatePlan, type Plan, type PlanInput } from "@/fitness/planner";
import { useApollo } from "@/shell/apollo";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

const field: React.CSSProperties = { height: 34, padding: "0 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", width: "100%" };
const KEY = "noesis.planInput";
const DEFAULT: PlanInput = { goal: "muscle", experience: "beginner", days: 4, minutes: 60, equipment: "full gym", injuries: [], focus: [], cardio: "some", weeks: 8, lifts: {} };
const INJ = ["knee", "lower back", "shoulder", "wrist", "elbow", "hip"];
const FOC = ["chest", "back", "arms", "shoulders", "legs", "glutes", "core"];

function Chips({ all, on, set }: { all: string[]; on: string[]; set: (v: string[]) => void }) {
  return <div className={u.row}>{all.map((x) => <button key={x} type="button" className="pill" data-active={on.includes(x)} onClick={() => set(on.includes(x) ? on.filter((y) => y !== x) : [...on, x])}>{x}</button>)}</div>;
}

export function WorkoutPlanner({ ctx }: { ctx: BlockCtx }) {
  const { submit } = useApollo();
  const [inp, setInp] = useState<PlanInput>(DEFAULT);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const plans = (ctx.data?.rows ?? []) as { id: string; title: string; plan: Plan; inputs: PlanInput; created_at: string; active: boolean }[];
  useEffect(() => { try { const j = localStorage.getItem(KEY); if (j) queueMicrotask(() => setInp({ ...DEFAULT, ...JSON.parse(j) })); } catch {} }, []);
  const set = (p: Partial<PlanInput>) => { const n = { ...inp, ...p }; setInp(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} };
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const L = inp.lifts ?? {};
  const label = (t: string, el: React.ReactNode) => <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-dim)" }}>{t}{el}</label>;

  const save = async () => {
    if (!plan) return;
    await ctx.write("create", "workout_plans", { title: plan.title, inputs: inp, plan, active: true });
    for (const d of plan.days) await ctx.write("create", "routines", { name: `${d.name} (${inp.goal})`, exercises: d.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, rest: e.rest })) });
    setSaved(`Saved. ${plan.days.length} routines added to Fitness › Routines.`);
  };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        {label("Main goal", <select style={field} value={inp.goal} onChange={(e) => set({ goal: e.target.value as PlanInput["goal"] })}>{["muscle", "strength", "fat loss", "general fitness", "athletic", "endurance"].map((x) => <option key={x}>{x}</option>)}</select>)}
        {label("Experience", <select style={field} value={inp.experience} onChange={(e) => set({ experience: e.target.value as PlanInput["experience"] })}><option value="beginner">beginner (&lt; 1 year)</option><option value="intermediate">intermediate (1-3 years)</option><option value="advanced">advanced (3+ years)</option></select>)}
        {label("Days per week", <select style={field} value={inp.days} onChange={(e) => set({ days: Number(e.target.value) })}>{[2, 3, 4, 5, 6].map((x) => <option key={x}>{x}</option>)}</select>)}
        {label("Minutes per session", <select style={field} value={inp.minutes} onChange={(e) => set({ minutes: Number(e.target.value) })}>{[30, 45, 60, 75, 90].map((x) => <option key={x}>{x}</option>)}</select>)}
        {label("Equipment", <select style={field} value={inp.equipment} onChange={(e) => set({ equipment: e.target.value as PlanInput["equipment"] })}>{["full gym", "barbell home gym", "home dumbbells", "bodyweight"].map((x) => <option key={x}>{x}</option>)}</select>)}
        {label("Cardio", <select style={field} value={inp.cardio} onChange={(e) => set({ cardio: e.target.value as PlanInput["cardio"] })}>{["none", "some", "lots"].map((x) => <option key={x}>{x}</option>)}</select>)}
        {label("Plan length (weeks)", <select style={field} value={inp.weeks} onChange={(e) => set({ weeks: Number(e.target.value) })}>{[4, 6, 8, 10, 12, 16].map((x) => <option key={x}>{x}</option>)}</select>)}
        {label("Age", <input style={field} type="number" value={inp.age ?? ""} onChange={(e) => set({ age: num(e.target.value) })} />)}
        {label("Sex", <select style={field} value={inp.sex ?? ""} onChange={(e) => set({ sex: (e.target.value || undefined) as PlanInput["sex"] })}><option value="">—</option><option>male</option><option>female</option><option>other</option></select>)}
        {label("Weight (kg)", <input style={field} type="number" value={inp.weightKg ?? ""} onChange={(e) => set({ weightKg: num(e.target.value) })} />)}
        {label("Height (cm)", <input style={field} type="number" value={inp.heightCm ?? ""} onChange={(e) => set({ heightCm: num(e.target.value) })} />)}
        {label("Average sleep (h)", <input style={field} type="number" step="0.5" value={inp.sleepHours ?? ""} onChange={(e) => set({ sleepHours: num(e.target.value) })} />)}
        {label("Sport you play (optional)", <input style={field} value={inp.sport ?? ""} onChange={(e) => set({ sport: e.target.value || undefined })} />)}
        {label("Exercises you dislike (comma separated)", <input style={field} value={inp.dislikes ?? ""} onChange={(e) => set({ dislikes: e.target.value })} />)}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <span className="label">Current lifts (best working weight, kg; leave blank if unsure)</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
          {(["bench", "squat", "deadlift", "ohp", "pullups"] as const).map((k) => label(k === "ohp" ? "overhead press" : k === "pullups" ? "pull-ups (reps)" : k, <input key={k} style={field} type="number" value={L[k] ?? ""} onChange={(e) => set({ lifts: { ...L, [k]: num(e.target.value) } })} />))}
        </div>
      </div>
      <div style={{ display: "grid", gap: 6 }}><span className="label">Injuries or areas to protect</span><Chips all={INJ} on={inp.injuries} set={(v) => set({ injuries: v })} /></div>
      <div style={{ display: "grid", gap: 6 }}><span className="label">Extra focus</span><Chips all={FOC} on={inp.focus} set={(v) => set({ focus: v })} /></div>
      <div className={u.row}>
        <button className="pill" data-active="true" onClick={() => { setPlan(generatePlan(inp)); setSaved(null); }}>Create my plan</button>
        {plan && <button className="pill" onClick={save}>Save plan &amp; add routines</button>}
        {plan && <button className="pill" onClick={() => submit(`Review and refine this workout plan for me. My details: ${JSON.stringify(inp)}. Plan: ${plan.days.map((d) => `${d.name}: ${d.exercises.map((e) => `${e.name} ${e.sets}x${e.reps}`).join(", ")}`).join(" | ")}. Suggest specific swaps or changes only if they clearly suit me better, and explain why in a few lines.`, { thread: "fitness:plan" })}>Ask Apollo to refine it</button>}
        {saved && <span className="label">{saved}</span>}
      </div>
      {plan && (
        <div style={{ display: "grid", gap: 12 }}>
          <div><b style={{ fontSize: 18 }}>{plan.title}</b><ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13.5 }}>{plan.summary.map((s) => <li key={s}>{s}</li>)}</ul></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {plan.days.map((d) => (
              <div key={d.name} style={{ padding: 12, borderRadius: 10, background: "var(--surface)", display: "grid", gap: 6 }}>
                <div className={u.row}><b style={{ flex: 1 }}>{d.name}</b><span className="label">~{d.minutes} min</span></div>
                <small className="label">Warm-up: {d.warmup}</small>
                <table style={{ borderCollapse: "collapse", fontSize: 13 }}><tbody>{d.exercises.map((e) => (
                  <tr key={e.name} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "4px 4px 4px 0" }}>{e.name}{e.start && <><br /><small className="label">{e.start}</small></>}{e.note && <><br /><small className="label">{e.note}</small></>}</td>
                    <td style={{ padding: 4, whiteSpace: "nowrap" }}><b>{e.sets} × {e.reps}</b><br /><small className="label">rest {e.rest}</small></td>
                  </tr>
                ))}</tbody></table>
                {d.cardio && <small>Cardio: {d.cardio}</small>}
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10, fontSize: 13.5 }}>
            <div><span className="label">Week by week</span><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{plan.weeks.reduce<{ from: number; to: number; note: string }[]>((acc, w) => { const l = acc[acc.length - 1]; if (l && l.note === w.note) l.to = w.week; else acc.push({ from: w.week, to: w.week, note: w.note }); return acc; }, []).map((g) => <li key={g.from}><b>{g.from === g.to ? `Week ${g.from}` : `Weeks ${g.from}-${g.to}`}:</b> {g.note}</li>)}</ul></div>
            <div><span className="label">Progression</span><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{plan.progression.map((x) => <li key={x}>{x}</li>)}</ul></div>
            <div><span className="label">Nutrition &amp; recovery</span><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{[...plan.nutrition, ...plan.recovery].map((x) => <li key={x}>{x}</li>)}</ul></div>
          </div>
        </div>
      )}
      {plans.length > 0 && (
        <div><span className="label">Saved plans</span>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 13.5 }}>{plans.map((p) => <li key={p.id}><button className="pill" onClick={() => { setPlan(p.plan); if (p.inputs) setInp({ ...DEFAULT, ...p.inputs }); }}>{p.title}</button> <small className="label">{new Date(p.created_at).toLocaleDateString("en-GB")}</small></li>)}</ul>
        </div>
      )}
    </div>
  );
}
