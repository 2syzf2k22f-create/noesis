// Patterns and insights, computed in code from logs (the AI never invents these).
import { weeklyScores } from "./scores";
import type { Row, Store } from "./store";

const DAY = 864e5;
const dayKey = (iso: string) => String(iso).slice(0, 10);

function streak(days: Set<string>) {
  let n = 0;
  for (let i = 0; ; i++) {
    const k = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    if (days.has(k)) n++;
    else if (i === 0) continue; // today may not be logged yet
    else break;
  }
  return n;
}

function pearson(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 5) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}

export async function insights(store: Store) {
  const since = new Date(Date.now() - 42 * DAY).toISOString();
  const get = async (t: string) => (await store.list(t, { limit: 5000 }).catch(() => [] as Row[])).filter((r) => r.created_at >= since && !r.deleted_at);
  const [study, sets, sleep, reviews] = await Promise.all([get("study_sessions"), get("sets"), get("sleep_logs"), get("reviews")]);
  const out: { title: string; detail: string; tone: "good" | "bad" | "info" }[] = [];

  const s1 = streak(new Set(study.map((r) => dayKey(r.created_at))));
  if (s1 >= 2) out.push({ title: `${s1}-day revision streak`, detail: "Days in a row with logged revision.", tone: "good" });
  const s2 = streak(new Set(reviews.map((r) => dayKey(r.created_at))));
  if (s2 >= 2) out.push({ title: `${s2}-day flashcard streak`, detail: "Days in a row with card reviews.", tone: "good" });

  // best revision weekday
  if (study.length >= 5) {
    const by = Array(7).fill(0);
    for (const r of study) by[new Date(r.created_at).getDay()] += Number(r.minutes) || 0;
    const best = by.indexOf(Math.max(...by));
    out.push({ title: `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][best]} is your strongest revision day`, detail: `${Math.round(by[best])} min over the last 6 weeks.`, tone: "info" });
  }

  // sleep vs next-day revision
  const sleepBy = new Map(sleep.map((r) => [dayKey(r.created_at), Number(r.hours)]));
  const studyBy = new Map<string, number>();
  for (const r of study) studyBy.set(dayKey(r.created_at), (studyBy.get(dayKey(r.created_at)) ?? 0) + (Number(r.minutes) || 0));
  const pairs = [...sleepBy].filter(([d]) => studyBy.has(d)).map(([d, h]) => [h, studyBy.get(d)!] as const);
  const r = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
  if (r != null && Math.abs(r) >= 0.3) out.push({ title: r > 0 ? "More sleep, more revision" : "Sleep and revision move apart", detail: `Correlation ${r.toFixed(2)} over ${pairs.length} days with both logged.`, tone: r > 0 ? "info" : "bad" });

  // training gap
  const lastSet = sets.map((x) => x.created_at).sort().pop();
  if (lastSet) {
    const gap = Math.floor((Date.now() - Date.parse(lastSet)) / DAY);
    if (gap >= 4) out.push({ title: `${gap} days since your last training session`, detail: "Your last logged set.", tone: "bad" });
  }

  // biggest weekly change
  const [now, prev] = await Promise.all([weeklyScores(store, 0), weeklyScores(store, 1)]);
  const deltas = now.areas.map((a) => ({ a: a.area, d: a.score != null && prev.areas.find((p) => p.area === a.area)?.score != null ? a.score - prev.areas.find((p) => p.area === a.area)!.score! : null })).filter((x) => x.d != null) as { a: string; d: number }[];
  deltas.sort((x, y) => Math.abs(y.d) - Math.abs(x.d));
  if (deltas[0] && Math.abs(deltas[0].d) >= 10) out.push({ title: `${deltas[0].a} ${deltas[0].d > 0 ? "up" : "down"} ${Math.abs(deltas[0].d)} points on last week`, detail: "Weekly score change so far.", tone: deltas[0].d > 0 ? "good" : "bad" });

  return out;
}

export async function scoreHistory(store: Store, weeks = 8) {
  const out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const s = await weeklyScores(store, w);
    out.push({ week: s.week, overall: s.overall, areas: Object.fromEntries(s.areas.map((a) => [a.area, a.score])) });
  }
  return out;
}
