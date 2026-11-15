import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import type { Row } from "@/core/store";
import { nowIso } from "@/core/store";
import { hasEvidence, priority, specWithEvidence, SPEC_SUBJECTS } from "@/core/spec";

const DEFAULT_BOUNDS: Record<string, number> = { "A*": 80, A: 70, B: 60, C: 50, D: 40, E: 30 };
const grade = (pct: number | null, b: Record<string, number>) => (pct == null ? null : Object.entries(b).sort((x, y) => y[1] - x[1]).find(([, v]) => pct >= v)?.[0] ?? "U");
const day = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

/** Everything the School feature blocks need, computed in code (no AI). */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const L = (t: string) => s.list(t, { order: { col: "created_at", asc: false }, limit: 5000 }).catch(() => [] as Row[]);
  const [spec, tests, papers, attempts, mistakes, sessions, plan, homework, events, settings] = await Promise.all([
    specWithEvidence(s), L("school_tests"), L("past_papers"), L("question_attempts"), L("mistakes"), L("study_sessions"), L("plan_items"), L("homework"), L("events"), s.get("settings", "main").catch(() => null),
  ]);
  const data = settings?.data ?? {};
  const bounds: Record<string, Record<string, number>> = Object.fromEntries(SPEC_SUBJECTS.map((x) => [x, { ...DEFAULT_BOUNDS, ...(data.grade_boundaries?.[x] ?? {}) }]));
  const targets: Record<string, number> = { Maths: 240, "Further Maths": 240, Physics: 240, Economics: 240, ...(data.subject_targets ?? {}) };
  const now = Date.now();
  const live = spec.filter((r) => r.level === 4 && !(r.optional && !r.chosen));
  const exams = events.filter((e) => e.kind === "exam" && !e.deleted_at && Date.parse(e.at) > now).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const subjects = SPEC_SUBJECTS.map((subject) => {
    const st = live.filter((r) => r.subject === subject);
    const rated = st.filter((r) => r.confidence != null);
    const conf = rated.length ? rated.reduce((a, r) => a + Number(r.confidence), 0) / rated.length : null;
    const coverage = st.length ? st.filter((r) => hasEvidence(r.evidence)).length / st.length : 0;
    const t = [...tests.filter((x) => x.subject === subject && x.pct != null).map((x) => ({ at: x.date ?? x.created_at, pct: Number(x.pct), kind: "test", label: x.title })), ...papers.filter((x) => x.subject === subject && x.pct != null).map((x) => ({ at: x.created_at, pct: Number(x.pct), kind: "paper", label: `${x.paper ?? ""} ${x.year ?? ""}`.trim() }))].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const recent = t.slice(-5), perf = recent.length ? recent.reduce((a, x) => a + x.pct, 0) / recent.length : null;
    const exam = exams.find((e) => e.subject === subject);
    const daysLeft = exam ? Math.max(1, Math.ceil((Date.parse(exam.at) - now) / 864e5)) : null;
    const notReady = st.filter((r) => Number(r.confidence ?? 0) < 4).length;
    // readiness: performance 45%, confidence 30%, coverage 25% (missing parts re-weighted)
    const parts: [number | null, number][] = [[perf, 0.45], [conf != null ? ((conf - 1) / 4) * 100 : null, 0.3], [st.length ? coverage * 100 : null, 0.25]];
    const w = parts.filter(([v]) => v != null).reduce((a, [, x]) => a + x, 0);
    const readiness = w ? Math.round(parts.filter(([v]) => v != null).reduce((a, [v, x]) => a + (v as number) * x, 0) / w) : null;
    // calibration per topic: confidence (as %) vs actual attempt/test %
    const topics = new Map<string, { conf: number[]; pct: number[] }>();
    for (const r of st) {
      const topic = String(r.parent_code ?? r.code); // group statements by the topic they sit under
      const x = topics.get(topic) ?? { conf: [], pct: [] };
      if (r.confidence != null) x.conf.push(((Number(r.confidence) - 1) / 4) * 100);
      if (r.evidence.attempt_pct != null) x.pct.push(r.evidence.attempt_pct);
      topics.set(topic, x);
    }
    const calibration = [...topics].filter(([, x]) => x.conf.length && x.pct.length).map(([topic, x]) => {
      const c = Math.round(x.conf.reduce((a, b) => a + b, 0) / x.conf.length), p = Math.round(x.pct.reduce((a, b) => a + b, 0) / x.pct.length);
      return { topic, confidence_pct: c, actual_pct: p, verdict: c - p > 20 ? "overconfident" : p - c > 20 ? "underconfident" : "calibrated" };
    });
    const b = bounds[subject];
    const minutes7 = sessions.filter((x) => x.subject === subject && now - Date.parse(x.created_at) < 7 * 864e5).reduce((a, x) => a + Number(x.minutes ?? 0), 0);
    return {
      subject, statements: st.length, rated: rated.length, avg_confidence: conf == null ? null : Math.round(conf * 10) / 10, coverage_pct: Math.round(coverage * 100),
      performance_pct: perf == null ? null : Math.round(perf), grade: grade(perf, b), readiness, bounds: b,
      to_a_star: perf == null ? null : Math.max(0, Math.round(b["A*"] - perf)),
      trend: t.map((x) => ({ ...x, at: day(x.at) })),
      exam: exam ? { title: exam.title, at: exam.at, days: daysLeft } : null, not_ready: notReady,
      per_day_needed: daysLeft ? Math.ceil(notReady / daysLeft * 10) / 10 : null, calibration,
      minutes_7d: minutes7, target_7d: targets[subject] ?? 240,
    };
  });

  // mistake patterns: unresolved mistakes grouped by spec topic / topic, and by kind
  const open = mistakes.filter((m) => !m.resolved);
  const groupBy = (f: (m: Row) => string) => Object.entries(open.reduce((acc, m) => { const k = f(m); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);
  const patterns = {
    by_topic: groupBy((m) => `${m.subject ?? "?"} · ${m.spec_code ?? m.topic ?? "untagged"}`).slice(0, 12).map(([k, n]) => ({ key: k, count: n })),
    by_kind: groupBy((m) => m.kind ?? m.why ?? "unclassified").map(([k, n]) => ({ key: k, count: n })),
    recurring: groupBy((m) => `${m.subject ?? "?"} · ${m.spec_code ?? m.topic ?? "untagged"}`).filter(([, n]) => n >= 2).length,
    open: open.length,
  };

  // past paper grid: subject x year x paper
  const grid = SPEC_SUBJECTS.map((subject) => ({ subject, cells: papers.filter((p) => p.subject === subject).map((p) => ({ paper: String(p.paper ?? "?"), year: String(p.year ?? "?"), pct: p.pct == null ? null : Number(p.pct), at: day(p.created_at) })) }));

  // plan vs done this week, and streaks
  const monday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const week = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return day(d); });
  const planWeek = week.map((d) => {
    const items = plan.filter((p) => String(p.date).slice(0, 10) === d);
    return { day: d, planned: items.length, done: items.filter((p) => p.done).length, planned_min: items.reduce((a, p) => a + Number(p.minutes ?? 0), 0), studied_min: sessions.filter((x) => day(x.created_at) === d).reduce((a, x) => a + Number(x.minutes ?? 0), 0) };
  });
  const studyDays = new Set(sessions.map((x) => day(x.created_at)));
  // current streak: consecutive study days ending today (or yesterday, if today isn't done yet)
  let streak = 0;
  const d0 = new Date(); if (!studyDays.has(day(d0))) d0.setDate(d0.getDate() - 1);
  for (const d = d0; studyDays.has(day(d)) && streak < 1000; d.setDate(d.getDate() - 1)) streak++;
  let best = 0, run = 0; const sortedDays = [...studyDays].sort();
  for (let i = 0; i < sortedDays.length; i++) { run = i && Date.parse(sortedDays[i]) - Date.parse(sortedDays[i - 1]) === 864e5 ? run + 1 : 1; best = Math.max(best, run); }
  const last30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (29 - i)); const k = day(d); return { day: k, minutes: sessions.filter((x) => day(x.created_at) === k).reduce((a, x) => a + Number(x.minutes ?? 0), 0) }; });

  const hwOpen = homework.filter((h) => !h.deleted_at && h.status !== "done").map((h) => ({ id: h.id, title: h.title, subject: h.subject, due_at: h.due_at }));
  return Response.json({ at: nowIso(), subjects, patterns, grid, plan_week: planWeek, streak: { current: streak, best, days_30: last30.filter((d) => d.minutes > 0).length, last30 }, homework_open: hwOpen,
    attempts_30d: attempts.filter((a) => now - Date.parse(a.created_at) < 30 * 864e5).length, priorities: live.sort((a, b) => priority(b) - priority(a)).slice(0, 10).map((r) => ({ subject: r.subject, code: r.code, title: r.title, text: r.text, confidence: r.confidence, evidence: r.evidence })) });
}

/** POST {grade_boundaries: {subject: {"A*": 80, ...}}} or {subject_targets: {subject: minutesPerWeek}} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const cur = await s.get("settings", "main");
  const data = { ...(cur?.data ?? {}) };
  if (b.grade_boundaries) data.grade_boundaries = { ...(data.grade_boundaries ?? {}), ...b.grade_boundaries };
  if (b.subject_targets) data.subject_targets = { ...(data.subject_targets ?? {}), ...b.subject_targets };
  if (cur) await s.update("settings", "main", { data, updated_at: nowIso() }); else await s.insert("settings", { id: "main", data });
  return Response.json({ ok: true });
}
