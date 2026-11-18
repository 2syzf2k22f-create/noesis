import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import type { Row } from "@/core/store";

/** Life vs grades: 12 weekly points of sleep, workouts, screen time and revision against question/test scores,
 *  with correlations computed in code (Pearson r, n weeks) and plain-English findings. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const W = 12, wk = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / (7 * 864e5));
  const get = (t: string) => s.list(t, { order: { col: "created_at", asc: false }, limit: 3000 }).catch(() => [] as Row[]);
  const [sleep, workouts, screen, study, attempts, tests] = await Promise.all([get("sleep_logs"), get("workouts"), s.list("screentime_days", { limit: 400 }).catch(() => [] as Row[]), get("study_sessions"), get("question_attempts"), get("school_tests")]);
  const weeks = Array.from({ length: W }, (_, i) => ({ w: i, sleep: [] as number[], workouts: 0, screen: [] as number[], study: 0, score: [] as number[] }));
  for (const r of sleep) { const i = wk(r.created_at); if (i < W) weeks[i].sleep.push(Number(r.hours)); }
  for (const r of workouts) { const i = wk(r.created_at); if (i < W && !r.deleted_at) weeks[i].workouts++; }
  for (const r of screen) { const i = wk(`${String(r.day).slice(0, 10)}T12:00:00Z`); if (i < W) weeks[i].screen.push(Number(r.minutes)); }
  for (const r of study) { const i = wk(r.created_at); if (i < W) weeks[i].study += Number(r.minutes ?? 0); }
  for (const r of attempts) { const i = wk(r.created_at); if (i < W && r.pct != null) weeks[i].score.push(Number(r.pct)); }
  for (const r of tests) { const i = wk(r.created_at); if (i < W && r.pct != null) weeks[i].score.push(Number(r.pct)); }
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const rows = weeks.map((x) => ({ weeks_ago: x.w, sleep_h: avg(x.sleep), workouts: x.workouts, screen_h: avg(x.screen) == null ? null : avg(x.screen)! / 60, revision_h: x.study / 60, score_pct: avg(x.score) })).reverse();
  const corr = (k: keyof (typeof rows)[number], t: keyof (typeof rows)[number]) => {
    const pairs = rows.filter((r) => r[k] != null && r[t] != null).map((r) => [Number(r[k]), Number(r[t])]);
    if (pairs.length < 4) return { r: null, n: pairs.length };
    const mx = avg(pairs.map((p) => p[0]))!, my = avg(pairs.map((p) => p[1]))!;
    const sx = Math.sqrt(pairs.reduce((a, p) => a + (p[0] - mx) ** 2, 0)), sy = Math.sqrt(pairs.reduce((a, p) => a + (p[1] - my) ** 2, 0));
    return { r: sx && sy ? Math.round((pairs.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / (sx * sy)) * 100) / 100 : null, n: pairs.length };
  };
  const factors = [["sleep_h", "sleep"], ["workouts", "workouts"], ["screen_h", "screen time"], ["revision_h", "revision"]] as const;
  const out = factors.map(([k, name]) => ({ factor: name, vs_score: corr(k, "score_pct"), vs_revision: k === "revision_h" ? null : corr(k, "revision_h") }));
  const words = (r: number) => (Math.abs(r) >= 0.6 ? "strong" : Math.abs(r) >= 0.35 ? "moderate" : "weak");
  const findings = out.filter((f) => f.vs_score.r != null && Math.abs(f.vs_score.r) >= 0.35).map((f) => `Weeks with more ${f.factor} had ${f.vs_score.r! > 0 ? "higher" : "lower"} scores (${words(f.vs_score.r!)}, r = ${f.vs_score.r}, ${f.vs_score.n} weeks). Correlation, not proof.`);
  return Response.json({ weeks: rows, correlations: out, findings: findings.length ? findings : ["Not enough of a pattern yet: needs 4+ weeks with both the habit and scores logged."] });
}
