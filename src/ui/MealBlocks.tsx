"use client";
// Meal plan creator (Apollo builds the plan from detailed preferences), the plan by week with
// eaten/rating per meal, saved recipes with ratings and favourites, and book recommendations.

import { useEffect, useMemo, useState } from "react";
import { useApollo } from "@/shell/apollo";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const field: React.CSSProperties = { height: 34, padding: "0 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", width: "100%" };
const save = (op: "update" | "create", table: string, d: object, id?: string) => fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, table, data: d, id }) });
async function data(binds: object[]) {
  return fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds }) }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
}
const KEY = "noesis.mealPrefs";
type Prefs = {
  weeks: number; start: string; slots: string[]; diet: string; allergies: string; dislikes: string; loves: string; cuisines: string[];
  kcal: string; protein: string; budget: string; maxMinutes: string; skill: string; equipment: string[]; servings: string; batch: boolean;
  goal: string; variety: string; lunchbox: boolean; notes: string;
};
const tomorrow = () => new Date(Date.now() + 864e5).toISOString().slice(0, 10);
const DEFAULT: Prefs = { weeks: 2, start: "", slots: ["breakfast", "lunch", "dinner"], diet: "none", allergies: "", dislikes: "", loves: "", cuisines: [], kcal: "", protein: "", budget: "", maxMinutes: "30", skill: "beginner", equipment: ["hob", "oven"], servings: "1", batch: true, goal: "maintain", variety: "balanced", lunchbox: true, notes: "" };
const CUISINES = ["British", "Italian", "Mexican", "Indian", "Chinese", "Japanese", "Thai", "Middle Eastern", "Mediterranean", "Korean"];
const EQUIP = ["hob", "oven", "microwave", "air fryer", "slow cooker", "blender", "grill"];
const Chips = ({ all, on, set }: { all: string[]; on: string[]; set: (v: string[]) => void }) => (
  <div className={u.row}>{all.map((x) => <button key={x} type="button" className="pill" data-active={on.includes(x)} onClick={() => set(on.includes(x) ? on.filter((y) => y !== x) : [...on, x])}>{x}</button>)}</div>
);

export function MealPlanner() {
  const { submit } = useApollo();
  const [p, setP] = useState<Prefs>(DEFAULT);
  const [sent, setSent] = useState(false);
  useEffect(() => { try { const j = localStorage.getItem(KEY); queueMicrotask(() => setP({ ...DEFAULT, start: tomorrow(), ...(j ? JSON.parse(j) : {}) })); } catch { queueMicrotask(() => setP({ ...DEFAULT, start: tomorrow() })); } }, []);
  const set = (x: Partial<Prefs>) => { const n = { ...p, ...x }; setP(n); try { localStorage.setItem(KEY, JSON.stringify(n)); } catch {} };
  const L = (t: string, el: React.ReactNode) => <label style={{ display: "grid", gap: 4, fontSize: 12, color: "var(--text-dim)" }}>{t}{el}</label>;
  const go = async () => {
    const [rec, facts] = await data([{ table: "recipes", where: { favourite: true }, limit: 50 }, { table: "body_metrics", limit: 1 }]);
    const favs = ((rec?.rows ?? []) as Row[]).map((r) => r.name);
    const weight = (facts?.rows ?? [])[0]?.weight_kg;
    submit(`Make me a meal plan. Preferences (JSON): ${JSON.stringify({ ...p, favourites_can_repeat: favs, body_weight_kg: weight ?? null })}`, { mode: "mealplan", thread: "nutrition:mealplan" });
    setSent(true);
  };
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
        {L("Weeks", <select style={field} value={p.weeks} onChange={(e) => set({ weeks: Number(e.target.value) })}>{[1, 2, 3, 4].map((x) => <option key={x}>{x}</option>)}</select>)}
        {L("Start", <input style={field} type="date" value={p.start} onChange={(e) => set({ start: e.target.value })} />)}
        {L("Goal", <select style={field} value={p.goal} onChange={(e) => set({ goal: e.target.value })}>{["maintain", "build muscle", "lose fat", "eat healthier", "save money", "fuel training"].map((x) => <option key={x}>{x}</option>)}</select>)}
        {L("Diet", <select style={field} value={p.diet} onChange={(e) => set({ diet: e.target.value })}>{["none", "vegetarian", "vegan", "pescatarian", "halal", "kosher", "gluten-free", "dairy-free", "low-carb"].map((x) => <option key={x}>{x}</option>)}</select>)}
        {L("Calories per day (optional)", <input style={field} type="number" value={p.kcal} onChange={(e) => set({ kcal: e.target.value })} />)}
        {L("Protein per day, g (optional)", <input style={field} type="number" value={p.protein} onChange={(e) => set({ protein: e.target.value })} />)}
        {L("Budget per week, £ (optional)", <input style={field} type="number" value={p.budget} onChange={(e) => set({ budget: e.target.value })} />)}
        {L("Max cooking time, min", <select style={field} value={p.maxMinutes} onChange={(e) => set({ maxMinutes: e.target.value })}>{["10", "20", "30", "45", "60", "90"].map((x) => <option key={x}>{x}</option>)}</select>)}
        {L("Cooking skill", <select style={field} value={p.skill} onChange={(e) => set({ skill: e.target.value })}>{["beginner", "confident", "advanced"].map((x) => <option key={x}>{x}</option>)}</select>)}
        {L("Servings per meal", <input style={field} type="number" value={p.servings} onChange={(e) => set({ servings: e.target.value })} />)}
        {L("Variety", <select style={field} value={p.variety} onChange={(e) => set({ variety: e.target.value })}>{["lots (new every day)", "balanced", "simple (repeat favourites)"].map((x) => <option key={x}>{x}</option>)}</select>)}
      </div>
      {L("Allergies / intolerances", <input style={field} value={p.allergies} onChange={(e) => set({ allergies: e.target.value })} placeholder="e.g. peanuts, lactose" />)}
      {L("Foods you dislike", <input style={field} value={p.dislikes} onChange={(e) => set({ dislikes: e.target.value })} placeholder="e.g. mushrooms, olives" />)}
      {L("Foods you love", <input style={field} value={p.loves} onChange={(e) => set({ loves: e.target.value })} placeholder="e.g. chicken, rice, pasta, curry" />)}
      <div style={{ display: "grid", gap: 6 }}><span className="label">Meals to plan</span><Chips all={["breakfast", "lunch", "dinner", "snack", "pre-workout"]} on={p.slots} set={(v) => set({ slots: v })} /></div>
      <div style={{ display: "grid", gap: 6 }}><span className="label">Cuisines you like</span><Chips all={CUISINES} on={p.cuisines} set={(v) => set({ cuisines: v })} /></div>
      <div style={{ display: "grid", gap: 6 }}><span className="label">Equipment</span><Chips all={EQUIP} on={p.equipment} set={(v) => set({ equipment: v })} /></div>
      <div className={u.row}>
        <label className={u.row} style={{ fontSize: 13 }}><input type="checkbox" checked={p.batch} onChange={(e) => set({ batch: e.target.checked })} /> Batch cook (cook once, eat 2-3 times)</label>
        <label className={u.row} style={{ fontSize: 13 }}><input type="checkbox" checked={p.lunchbox} onChange={(e) => set({ lunchbox: e.target.checked })} /> School lunches I can take with me</label>
      </div>
      {L("Anything else", <input style={field} value={p.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="e.g. high protein after gym days, quick breakfasts, Sunday roast" />)}
      <div className={u.row}>
        <button className="pill" data-active="true" disabled={!p.slots.length} onClick={go}>Create my meal plan</button>
        {sent && <span className="label">Apollo is building it (it appears below when saved; needs your PC&apos;s relay).</span>}
      </div>
    </div>
  );
}

export function MealPlanView({ ctx }: { ctx: BlockCtx }) {
  const items = (ctx.data?.rows ?? []) as Row[];
  const [recipes, setRecipes] = useState<Row[]>([]);
  const [week, setWeek] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { data([{ table: "recipes", limit: 500 }]).then(([r]) => setRecipes(r?.rows ?? [])); }, [ctx.data]);
  const rec = (it: Row) => recipes.find((r) => r.id === it.recipe_id) ?? recipes.find((r) => String(r.name).toLowerCase() === String(it.recipe_name).toLowerCase());
  const start = useMemo(() => { const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day + week * 7); return d; }, [week]);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d.toLocaleDateString("en-CA"); });
  const slots = [...new Set(items.map((i) => i.slot))].sort((a, b) => ["breakfast", "lunch", "snack", "pre-workout", "dinner"].indexOf(a) - ["breakfast", "lunch", "snack", "pre-workout", "dinner"].indexOf(b));
  const totals = (d: string) => items.filter((i) => String(i.date).slice(0, 10) === d).reduce((a, i) => { const r = rec(i); return { k: a.k + Number(r?.kcal ?? 0), p: a.p + Number(r?.protein_g ?? 0) }; }, { k: 0, p: 0 });
  const opened = open ? recipes.find((r) => r.id === open) : null;
  if (!items.length) return <div className="label">No meal plan yet. Create one above.</div>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className={u.row}>
        <button className="pill" onClick={() => setWeek(week - 1)}>‹</button>
        <b style={{ flex: 1, textAlign: "center" }}>Week of {start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</b>
        <button className="pill" onClick={() => setWeek(0)}>This week</button>
        <button className="pill" onClick={() => setWeek(week + 1)}>›</button>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12.5, width: "100%" }}>
          <thead><tr><th />{days.map((d) => { const t = totals(d); return <th key={d} style={{ padding: 4, textAlign: "left" }}>{new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}{t.k ? <><br /><small className="label">{t.k} kcal · {t.p} g P</small></> : null}</th>; })}</tr></thead>
          <tbody>{slots.map((s) => (
            <tr key={s} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: 4 }} className="label">{s}</td>
              {days.map((d) => { const it = items.find((i) => String(i.date).slice(0, 10) === d && i.slot === s); const r = it ? rec(it) : null; return (
                <td key={d} style={{ padding: 4, verticalAlign: "top", minWidth: 110 }}>
                  {it && (
                    <div style={{ display: "grid", gap: 2, opacity: it.eaten ? 0.6 : 1 }}>
                      <button style={{ textAlign: "left", fontWeight: 600 }} onClick={() => setOpen(r?.id ?? null)}>{it.recipe_name}</button>
                      <div className={u.row} style={{ gap: 2 }}>
                        <button title="Eaten" onClick={async () => { await ctx.write("update", "meal_plan_items", { eaten: !it.eaten }, it.id); if (!it.eaten && r) await ctx.write("create", "meals", { name: r.name, recipe_id: r.id, kcal: r.kcal ?? null, protein_g: r.protein_g ?? null }); }} style={{ fontSize: 12 }}>{it.eaten ? "✓" : "○"}</button>
                        {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => ctx.write("update", "meal_plan_items", { rating: n }, it.id)} style={{ fontSize: 11, color: (it.rating ?? 0) >= n ? "#f5a524" : "var(--text-dim)" }}>★</button>)}
                      </div>
                    </div>
                  )}
                </td>
              ); })}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {opened && <RecipeCard r={opened} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RecipeCard({ r, onClose }: { r: Row; onClose: () => void }) {
  const [rating, setRating] = useState<number>(r.rating ?? 0);
  const [fav, setFav] = useState<boolean>(!!r.favourite);
  return (
    <div style={{ padding: 12, borderRadius: 10, background: "var(--surface)", display: "grid", gap: 6 }}>
      <div className={u.row}>
        <b style={{ flex: 1, fontSize: 16 }}>{r.name}</b>
        {[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={async () => { setRating(n); await save("update", "recipes", { rating: n }, r.id); }} style={{ color: rating >= n ? "#f5a524" : "var(--text-dim)", fontSize: 17 }}>★</button>)}
        <button className="pill" data-active={fav} onClick={async () => { setFav(!fav); await save("update", "recipes", { favourite: !fav }, r.id); }}>{fav ? "♥ Saved" : "♡ Save"}</button>
        <button className="pill" onClick={onClose}>Close</button>
      </div>
      <small className="label">{[r.cuisine, r.minutes ? `${r.minutes} min` : null, r.servings ? `serves ${r.servings}` : null, r.kcal ? `${r.kcal} kcal` : null, r.protein_g ? `${r.protein_g} g protein` : null, r.carbs_g ? `${r.carbs_g} g carbs` : null, r.fat_g ? `${r.fat_g} g fat` : null, r.cost_gbp ? `~£${r.cost_gbp}` : null].filter(Boolean).join(" · ")}</small>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.4fr)", gap: 12, fontSize: 13.5 }}>
        <div><span className="label">Ingredients</span><pre style={{ whiteSpace: "pre-wrap", margin: 0, font: "inherit" }}>{r.ingredients}</pre></div>
        <div><span className="label">Method</span><pre style={{ whiteSpace: "pre-wrap", margin: 0, font: "inherit" }}>{r.steps}</pre></div>
      </div>
    </div>
  );
}

/** Saved recipes: rate, favourite, filter. */
export function RecipeBook({ ctx }: { ctx: BlockCtx }) {
  const rows = (ctx.data?.rows ?? []) as Row[];
  const [only, setOnly] = useState<"all" | "fav" | "rated">("all");
  const [open, setOpen] = useState<string | null>(null);
  const list = rows.filter((r) => !r.deleted_at && (only === "all" || (only === "fav" ? r.favourite : (r.rating ?? 0) >= 4))).sort((a, b) => Number(b.favourite) - Number(a.favourite) || (b.rating ?? 0) - (a.rating ?? 0));
  const opened = rows.find((r) => r.id === open);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row}>{(["all", "fav", "rated"] as const).map((x) => <button key={x} className="pill" data-active={only === x} onClick={() => setOnly(x)}>{x === "fav" ? "♥ Saved" : x === "rated" ? "★ 4+" : "All"}</button>)}<span className="label">{list.length} recipes</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
        {list.map((r) => (
          <button key={r.id} onClick={() => setOpen(r.id)} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, background: "var(--surface)", display: "grid", gap: 2 }}>
            <b>{r.favourite ? "♥ " : ""}{r.name}</b>
            <small className="label">{"★".repeat(r.rating ?? 0)}{r.kcal ? ` ${r.kcal} kcal` : ""}{r.protein_g ? ` · ${r.protein_g} g P` : ""}{r.minutes ? ` · ${r.minutes} min` : ""}</small>
          </button>
        ))}
      </div>
      {opened && <RecipeCard key={opened.id} r={opened} onClose={() => setOpen(null)} />}
    </div>
  );
}

/** Book recommendations (Opportunities), with "add to reading list". */
export function BookRecs({ ctx }: { ctx: BlockCtx }) {
  const rows = ((ctx.data?.rows ?? []) as Row[]).filter((r) => !r.deleted_at);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className={u.row}>
        <button className="pill" data-active="true" onClick={async () => { const r = await fetch("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "books" }) }).then((x) => x.json()).catch(() => null); setMsg(r?.id ? `Finding books${r.relayOnline ? "" : " (queued until the relay is online)"}…` : "Couldn't queue it."); }}>Recommend books now</button>
        <span className="label">{msg ?? "New picks arrive every other Saturday."}</span>
      </div>
      {rows.map((b) => (
        <div key={b.id} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--surface)", display: "grid", gap: 2 }}>
          <div className={u.row}>
            <b style={{ flex: 1 }}><a href={b.url} target="_blank" rel="noreferrer">{b.title}</a> <span className="label">{b.author}</span></b>
            <button className="pill" onClick={async () => { await ctx.write("create", "books", { title: b.title, author: b.author ?? null, status: "to read" }); await ctx.write("delete", "opportunities", undefined, b.id); setMsg(`${b.title} added to your reading list.`); }}>+ Reading list</button>
            <button className="pill" onClick={() => ctx.write("delete", "opportunities", undefined, b.id)}>Not for me</button>
          </div>
          <small>{b.summary}</small>
        </div>
      ))}
      {!rows.length && <span className="label">No recommendations yet.</span>}
    </div>
  );
}
