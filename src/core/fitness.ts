// Fitness: structured routines, muscle groups, last weights, PRs, weekly volume, overload and deload hints.
import type { Row } from "./store";

export type Item = { name: string; sets?: number; reps?: string; rest?: number; notes?: string; note?: boolean };
export const SPLITS = ["upper", "lower", "push", "pull", "legs", "core", "full body", "other"] as const;
export const MUSCLES = ["chest", "back", "shoulders", "arms", "core", "legs"] as const;

/** "Bench press 4x8-10" -> {name, sets, reps}; "Push-ups 1 set" -> sets 1; anything else is a note line. */
export function parseLines(text: string): Item[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = /^(.*?)\s+(\d+)\s*[x×]\s*(.+)$/i.exec(line);
    if (m) return { name: m[1].trim(), sets: Number(m[2]), reps: m[3].trim() };
    const s = /^(.*?)\s+(\d+)\s+sets?$/i.exec(line);
    if (s) return { name: s[1].trim(), sets: Number(s[2]), reps: "to failure" };
    return { name: line, note: true };
  });
}
export const toText = (items: Item[]) => items.map((i) => (i.note ? i.name : `${i.name} ${i.sets ?? 3}x${i.reps ?? "8-12"}`)).join("\n");
export function itemsOf(r: Row): Item[] {
  if (Array.isArray(r.items) && r.items.length) return r.items as Item[];
  const t = typeof r.exercises === "string" ? r.exercises : Array.isArray(r.exercises) ? r.exercises.join("\n") : "";
  return parseLines(t);
}

const M: [RegExp, (typeof MUSCLES)[number]][] = [
  [/bench|chest|fly|crossover|push-?up|dip(?!.*tricep)|pec|incline .*press|decline .*press|^dumbbell press|floor press/i, "chest"],
  [/row|pulldown|pull-?up|chin-?up|lat\b|face pull|shrug/i, "back"],
  [/shoulder press|overhead press|lateral raise|rear delt|arnold|military|upright/i, "shoulders"],
  [/curl(?!.*leg)|tricep|pushdown|skull|hammer|extension(?=.*(tricep|overhead))|close-grip/i, "arms"],
  [/plank|crunch|knee raise|leg raise|ab\b|abs|core|sit-?up|farmer|carry|pallof|russian twist|hollow/i, "core"],
  [/squat|lunge|leg|calf|hip thrust|glute|step-?up|deadlift|rdl|hamstring|quad|jump/i, "legs"],
];
export const musclesOf = (name: string) => [...new Set(M.filter(([re]) => re.test(name)).map(([, m]) => m))];
export const isCompound = (name: string) => /bench|squat|deadlift|press|row|pulldown|pull-?up|lunge|thrust|dip|chin/i.test(name);
export const restFor = (i: Item) => i.rest ?? (isCompound(i.name) ? 120 : 90);
/** Top of a rep range ("6-10" -> 10, "12" -> 12, "30-60 s" -> null for timed work). */
export const repTop = (reps?: string) => { if (!reps || /s\b|sec|min/i.test(reps)) return null; const n = [...reps.matchAll(/\d+/g)].map((x) => Number(x[0])); return n.length ? Math.max(...n) : null; };
export const minutesFor = (items: Item[]) => Math.round(items.filter((i) => !i.note).reduce((a, i) => a + (i.sets ?? 3) * (0.75 + restFor(i) / 60), 0) + 5);
export const e1rm = (w: number, r: number) => w * (1 + r / 30); // Epley
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const sameExercise = (a: string, b: string) => norm(a) === norm(b);

/** Per exercise: last session's sets, trend vs the session before, best e1RM, and an overload suggestion. */
export function exerciseHistory(sets: Row[], name: string, reps?: string) {
  const mine = sets.filter((s) => sameExercise(String(s.exercise ?? ""), name) && Number(s.reps) > 0).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const sessions: Row[][] = [];
  for (const s of mine) {
    const key = s.workout_id ?? String(s.created_at).slice(0, 10);
    const last = sessions[sessions.length - 1];
    if (last && (last[0].workout_id ?? String(last[0].created_at).slice(0, 10)) === key) last.push(s); else sessions.push([s]);
  }
  const top = (ss: Row[] | undefined) => (ss?.length ? Math.max(...ss.map((s) => Number(s.weight_kg ?? 0))) : null);
  const last = sessions[0], prev = sessions[1];
  const lastW = top(last), prevW = top(prev);
  const best = mine.reduce((b, s) => Math.max(b, e1rm(Number(s.weight_kg ?? 0), Number(s.reps))), 0);
  const bestSet = mine.reduce<Row | null>((b, s) => (!b || e1rm(Number(s.weight_kg ?? 0), Number(s.reps)) > e1rm(Number(b.weight_kg ?? 0), Number(b.reps)) ? s : b), null);
  const t = repTop(reps);
  // every set last time hit the top of the range -> add weight (2.5 kg steps; 5 kg for big lower-body lifts)
  const hitTop = !!(last?.length && t && last.every((s) => Number(s.reps) >= t));
  const step = /squat|deadlift|thrust|leg press/i.test(name) ? 5 : 2.5;
  return {
    last: last?.map((s) => ({ weight_kg: Number(s.weight_kg ?? 0), reps: Number(s.reps) })).reverse() ?? [],
    last_weight: lastW, trend: lastW == null || prevW == null ? null : lastW > prevW ? "up" : lastW < prevW ? "down" : "flat",
    best_e1rm: best ? Math.round(best * 10) / 10 : null, best_set: bestSet ? { weight_kg: Number(bestSet.weight_kg ?? 0), reps: Number(bestSet.reps), at: bestSet.created_at } : null,
    add_weight: hitTop && lastW != null ? Math.round((lastW + step) * 10) / 10 : null,
  };
}
/** Deload every 6th training week (counted from the first logged workout). */
export function deloadWeek(workouts: Row[]) {
  const first = workouts.map((w) => Date.parse(w.created_at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  if (!first) return false;
  const weeks = Math.floor((Date.now() - first) / (7 * 864e5));
  return weeks % 6 === 5;
}
