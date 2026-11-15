import { schedule, autoRating, dayEnd, studyDay, type Card } from "../src/core/sr";
let c: Card = { state: "new", stability: null, difficulty: null, due_at: null, last_reviewed_at: null, reps: 0, lapses: 0, step: 0 };
let t = new Date("2026-11-16T10:00:00Z");
const show = (label: string, x: ReturnType<typeof schedule>) => console.log(label.padEnd(26), x.state.padEnd(10), `${x.interval_days < 1 ? `${Math.round(x.interval_days * 1440)} min` : `${x.interval_days.toFixed(1)} d`}`.padEnd(10), `S=${x.stability!.toFixed(2)} D=${x.difficulty!.toFixed(2)}`);
for (const [g, lbl] of [[3, "new: Good"], [3, "learning: Good"], [3, "review: Good"], [3, "review: Good"], [1, "review: Again (lapse)"], [3, "relearning: Good"], [4, "review: Easy"]] as [number, string][]) {
  const x = schedule(c, g, t, undefined, { seed: "x" }); show(lbl, x); c = x; t = new Date(Date.parse(x.due_at!));
}
const capped = schedule({ ...c }, 3, t, undefined, { cap: new Date(t.getTime() + 3 * 864e5).toISOString() }); show("capped by exam in 3d", capped);
console.log("auto geo:", autoRating(false, 3000, "geo"), autoRating(true, 3000, "geo"), autoRating(true, 8000, "geo"), autoRating(true, 15000, "geo"));
console.log("day end from 02:00 UK:", dayEnd(new Date("2026-11-16T02:00:00Z")).toISOString(), "| study day of 03:30:", studyDay("2026-11-16T03:30:00Z"));
