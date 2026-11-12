// In-depth statistics for any logged metric, computed in code:
// totals, averages, median, best/worst, spread, trend vs the previous period, consistency,
// weekday and hour-of-day patterns, distribution histogram, personal records and streaks.
import type { Row, Store } from "./store";

export type DeepStatsReq = {
  table: string;
  field?: string; // numeric field; omitted = count events
  where?: Record<string, string | number | boolean | null>;
  days?: number; // analysis window (default 90)
  better?: "higher" | "lower"; // which direction is "best" (default higher)
  groupBy?: string; // optional breakdown field (e.g. subject, exercise)
};

const DAY = 864e5;
const dkey = (iso: string) => String(iso).slice(0, 10);

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
const round = (n: number | null, d = 1) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

export async function deepStats(store: Store, r: DeepStatsReq) {
  const days = r.days ?? 90, better = r.better ?? "higher";
  const all = (await store.list(r.table, { eq: r.where, limit: 20000 }).catch(() => [] as Row[])).filter((x) => !x.deleted_at);
  const since = Date.now() - days * DAY, prevSince = since - days * DAY;
  const val = (x: Row) => (r.field ? Number(x[r.field]) : 1);
  const ok = (x: Row) => !r.field || Number.isFinite(val(x));
  const rows = all.filter((x) => Date.parse(x.created_at) >= since && ok(x));
  const prev = all.filter((x) => { const t = Date.parse(x.created_at); return t >= prevSince && t < since && ok(x); });
  if (!rows.length) return { empty: true, count: 0, days };

  const vals = rows.map(val), sorted = [...vals].sort((a, b) => a - b);
  const sum = vals.reduce((a, b) => a + b, 0), mean = sum / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  const prevVals = prev.map(val), prevSum = prevVals.reduce((a, b) => a + b, 0);
  const prevMean = prevVals.length ? prevSum / prevVals.length : null;

  // per-day totals
  const byDay = new Map<string, number>();
  for (const x of rows) byDay.set(dkey(x.created_at), (byDay.get(dkey(x.created_at)) ?? 0) + val(x));
  const activeDays = byDay.size;
  const dayVals = [...byDay.values()];
  const bestDay = [...byDay].sort((a, b) => b[1] - a[1])[0];

  // weekday & hour patterns (average per active occurrence)
  const wd = Array.from({ length: 7 }, () => ({ n: 0, s: 0 })), hr = Array.from({ length: 24 }, () => ({ n: 0, s: 0 }));
  for (const x of rows) {
    const d = new Date(x.created_at);
    const w = (d.getDay() + 6) % 7;
    wd[w].n++; wd[w].s += val(x);
    hr[d.getHours()].n++; hr[d.getHours()].s += val(x);
  }
  const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // histogram (10 bins)
  const lo = sorted[0], hi = sorted[sorted.length - 1], bins = 10, w = (hi - lo) / bins || 1;
  const hist = Array.from({ length: bins }, (_, i) => ({ label: `${round(lo + i * w, 0)}`, value: 0 }));
  for (const v of vals) hist[Math.min(bins - 1, Math.floor((v - lo) / w))].value++;

  // streaks of active days
  let cur = 0, best = 0, run = 0;
  for (let i = days; i >= 0; i--) {
    const k = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    if (byDay.has(k)) { run++; best = Math.max(best, run); } else run = 0;
  }
  for (let i = 0; ; i++) {
    const k = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    if (byDay.has(k)) cur++; else if (i === 0) continue; else break;
  }

  // trend: least-squares slope of daily totals (per week)
  const pts = [...byDay].map(([k, v]) => [Date.parse(k) / DAY, v] as const);
  let slope: number | null = null;
  if (pts.length >= 3) {
    const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const num = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0), den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    slope = den ? (num / den) * 7 : null;
  }

  const bestRow = rows.reduce((b, x) => (better === "higher" ? (val(x) > val(b) ? x : b) : (val(x) < val(b) ? x : b)), rows[0]);
  const recent = [...rows].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
  const recentAvg = recent.reduce((a, x) => a + val(x), 0) / recent.length;
  const pct = (v: number) => Math.round((sorted.filter((s) => (better === "higher" ? s <= v : s >= v)).length / sorted.length) * 100);

  let breakdown: { label: string; value: number; n: number }[] | undefined;
  if (r.groupBy) {
    const g = new Map<string, { s: number; n: number }>();
    for (const x of rows) { const k = String(x[r.groupBy] ?? "—"); const e = g.get(k) ?? { s: 0, n: 0 }; e.s += val(x); e.n++; g.set(k, e); }
    breakdown = [...g].map(([label, e]) => ({ label, value: round(r.field ? e.s / e.n : e.n)!, n: e.n })).sort((a, b) => b.value - a.value);
  }

  return {
    empty: false, days, count: rows.length, prevCount: prev.length,
    total: round(sum), prevTotal: round(prevSum), mean: round(mean, 2), prevMean: round(prevMean, 2),
    median: round(quantile(sorted, 0.5), 2), p10: round(quantile(sorted, 0.1), 2), p90: round(quantile(sorted, 0.9), 2),
    min: round(sorted[0], 2), max: round(sorted[sorted.length - 1], 2), sd: round(sd, 2),
    best: { value: round(val(bestRow), 2), at: bestRow.created_at },
    recentAvg: round(recentAvg, 2), recentPercentile: pct(recentAvg),
    activeDays, consistency: Math.round((activeDays / days) * 100), perActiveDay: round(dayVals.reduce((a, b) => a + b, 0) / activeDays, 1),
    bestDay: bestDay ? { day: bestDay[0], value: round(bestDay[1]) } : null,
    trendPerWeek: round(slope, 2),
    streak: { current: cur, best },
    weekday: WD.map((label, i) => ({ label, value: wd[i].n ? round(r.field ? wd[i].s / wd[i].n : wd[i].n)! : 0 })),
    hours: hr.map((h, i) => ({ label: String(i).padStart(2, "0"), value: h.n })).filter((_, i) => i >= 5),
    histogram: hist,
    breakdown,
    better,
  };
}
