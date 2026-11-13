// School analysis, computed in code: for each subject, current level (school tests, past papers,
// practice questions), weakest topics, revision time and where it went, flashcard retention,
// homework completion, trend, and a "path to A*" with concrete actions. Used by the School
// overview, and given to the weekly report so the commentary explains what the stats mean.
import type { Row, Store } from "./store";

export const SUBJECTS = ["Maths", "Further Maths", "Physics", "Economics"];
const DAY = 864e5;
const BOUNDS: [string, number][] = [["A*", 80], ["A", 70], ["B", 60], ["C", 50], ["D", 40], ["E", 30]];
export const gradeFor = (pct: number | null) => (pct == null ? null : BOUNDS.find(([, b]) => pct >= b)?.[0] ?? "U");
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number | null) => (x == null ? null : Math.round(x * 10) / 10);
const norm = (s: unknown) => String(s ?? "").trim();

export type TopicStat = { topic: string; pct: number; marks: number; total: number; sources: number; lastSeen: string };
export type SubjectAnalysis = {
  subject: string; target: string; level: number | null; grade: string | null; gapToTarget: number | null; trend: number | null;
  evidence: { tests: number; papers: number; questions: number };
  revision: { minutes28: number; perWeek: number; share: number };
  flashcards: { reviews28: number; retention: number | null; due: number };
  homework: { done: number; open: number; overdue: number };
  topics: TopicStat[]; weakest: TopicStat[]; specRed: string[];
  actions: string[];
};

export async function schoolAnalysis(store: Store, targetGrade = "A*") {
  const [tests, papers, paperTopics, attempts, sessions, reviews, cards, homework, spec, mistakes] = await Promise.all(
    ["school_tests", "past_papers", "past_paper_topics", "question_attempts", "study_sessions", "reviews", "flashcards", "homework", "spec_topics", "mistakes"]
      .map((t) => store.list(t, { order: { col: "created_at", asc: false }, limit: 5000 }).catch(() => [] as Row[])),
  );
  const now = Date.now();
  const target = BOUNDS.find(([g]) => g === targetGrade)?.[1] ?? 80;
  const totalMins28 = sessions.filter((s) => now - Date.parse(s.created_at) < 28 * DAY).reduce((a, s) => a + Number(s.minutes || 0), 0);

  const out: SubjectAnalysis[] = SUBJECTS.map((subject) => {
    const is = (r: Row) => norm(r.subject).toLowerCase() === subject.toLowerCase();
    const T = tests.filter(is), P = papers.filter(is), Q = attempts.filter((a) => is(a) && a.marks != null);
    // evidence, newest first, weighted: school tests and full papers count most
    const ev: { pct: number; w: number; at: number }[] = [
      ...T.map((t) => ({ pct: Number(t.pct), w: 3, at: Date.parse(t.date ?? t.created_at) })),
      ...P.map((p) => ({ pct: Number(p.pct), w: 3, at: Date.parse(p.created_at) })),
      ...Q.map((q) => ({ pct: Number(q.pct ?? (Number(q.marks) / Number(q.total || 1)) * 100), w: 0.4, at: Date.parse(q.created_at) })),
    ].filter((x) => Number.isFinite(x.pct)).sort((a, b) => b.at - a.at);
    // recency decay: half weight every ~60 days
    let ws = 0, wsum = 0;
    for (const e of ev) { const k = e.w * Math.pow(0.5, (now - e.at) / (60 * DAY)); ws += e.pct * k; wsum += k; }
    const level = wsum ? ws / wsum : null;
    const big = ev.filter((e) => e.w >= 3);
    const trend = big.length >= 4 ? (avg(big.slice(0, 2).map((e) => e.pct))! - avg(big.slice(-2).map((e) => e.pct))!) : null;

    // topics from school tests, paper topics and question attempts
    const tm = new Map<string, { m: number; t: number; n: number; last: number }>();
    const addT = (topic: unknown, m: number, t: number, at: number) => {
      const k = norm(topic); if (!k || !(t > 0)) return;
      const v = tm.get(k) ?? { m: 0, t: 0, n: 0, last: 0 };
      v.m += m; v.t += t; v.n++; v.last = Math.max(v.last, at); tm.set(k, v);
    };
    for (const t of T) for (const x of (Array.isArray(t.topics) ? t.topics : []) as Row[]) addT(x.topic, Number(x.marks), Number(x.total), Date.parse(t.date ?? t.created_at));
    for (const x of paperTopics.filter(is)) addT(x.topic, Number(x.marks), Number(x.total), Date.parse(x.created_at));
    for (const q of Q) addT(q.subtopic ? `${q.topic} › ${q.subtopic}` : q.topic, Number(q.marks), Number(q.total), Date.parse(q.created_at));
    const topics: TopicStat[] = [...tm.entries()].map(([topic, v]) => ({ topic, pct: r1((v.m / v.t) * 100)!, marks: v.m, total: v.t, sources: v.n, lastSeen: new Date(v.last).toISOString() })).sort((a, b) => a.pct - b.pct);
    const weakest = topics.filter((t) => t.pct < target).slice(0, 5);

    const mins28 = sessions.filter((s) => is(s) && now - Date.parse(s.created_at) < 28 * DAY).reduce((a, s) => a + Number(s.minutes || 0), 0);
    const R = reviews.filter((r) => norm(r.deck).toLowerCase() === subject.toLowerCase() && now - Date.parse(r.created_at) < 28 * DAY);
    const H = homework.filter((h) => is(h) && !h.deleted_at);
    const specRed = spec.filter((s) => is(s) && Number(s.confidence) === 1).map((s) => s.title);
    const openMistakes = mistakes.filter((m) => is(m) && !m.resolved).length;
    const grade = gradeFor(level);
    const gap = level == null ? null : Math.max(0, target - level);

    const actions: string[] = [];
    if (level == null) actions.push(`No marks yet: log a ${subject} school test or past paper so the prediction means something.`);
    else if (gap === 0) actions.push(`You're at ${targetGrade} standard (${r1(level)}%). Keep it there with one timed past paper a fortnight.`);
    else actions.push(`You're ${r1(gap)} percentage points below ${targetGrade} (${r1(level)}% vs ${target}%).`);
    if (weakest.length) actions.push(`Biggest wins: ${weakest.slice(0, 3).map((t) => `${t.topic} (${t.pct}%)`).join(", ")}. Do targeted questions, then a mixed set a week later.`);
    if (specRed.length) actions.push(`Spec topics you've marked red: ${specRed.slice(0, 4).join(", ")}.`);
    const fair = totalMins28 / SUBJECTS.length;
    if (mins28 < fair * 0.6 && (gap ?? 0) > 0) actions.push(`Only ${mins28} min revised in 28 days (${Math.round((mins28 / Math.max(1, totalMins28)) * 100)}% of your revision). Give it more time.`);
    if (!Q.length && !P.length) actions.push("Start exam-style practice: School › Questions, or a past paper under timed conditions.");
    if (R.length < 20) actions.push("Use flashcards for definitions and formulae: a few minutes a day keeps them fresh.");
    const overdue = H.filter((h) => h.status !== "done" && h.due_at && Date.parse(h.due_at) < now).length;
    if (overdue) actions.push(`${overdue} overdue homework: clear it first.`);
    if (openMistakes) actions.push(`${openMistakes} unresolved items in your mistake log: redo them.`);
    if (trend != null && trend < -3) actions.push(`Recent marks are down ${r1(-trend)} points: revisit what changed (topic? timing? sleep?).`);

    return {
      subject, target: targetGrade, level: r1(level), grade, gapToTarget: r1(gap), trend: r1(trend),
      evidence: { tests: T.length, papers: P.length, questions: Q.length },
      revision: { minutes28: mins28, perWeek: Math.round(mins28 / 4), share: totalMins28 ? Math.round((mins28 / totalMins28) * 100) : 0 },
      flashcards: { reviews28: R.length, retention: R.length ? Math.round((R.filter((r) => Number(r.grade) >= 3).length / R.length) * 100) : null, due: cards.filter((c) => norm(c.deck).toLowerCase() === subject.toLowerCase() && !c.deleted_at && (!c.due_at || Date.parse(c.due_at) <= now)).length },
      homework: { done: H.filter((h) => h.status === "done").length, open: H.filter((h) => h.status !== "done").length, overdue },
      topics, weakest, specRed, actions,
    };
  });
  const atTarget = out.filter((s) => s.gapToTarget === 0).length;
  return { target: targetGrade, atTarget, subjects: out, revisionMinutes28: totalMins28 };
}

/** A compact version for the weekly report prompt (keeps tokens down). */
export function compactAnalysis(a: Awaited<ReturnType<typeof schoolAnalysis>>) {
  return {
    target: a.target, subjects_at_target: `${a.atTarget}/${a.subjects.length}`, revision_minutes_28d: a.revisionMinutes28,
    subjects: a.subjects.map((s) => ({ subject: s.subject, level_pct: s.level, predicted: s.grade, gap_pts: s.gapToTarget, trend_pts: s.trend, evidence: s.evidence, revision_min_28d: s.revision.minutes28, revision_share_pct: s.revision.share, flashcard_retention_pct: s.flashcards.retention, homework_overdue: s.homework.overdue, weakest: s.weakest.slice(0, 3).map((t) => `${t.topic} ${t.pct}%`) })),
  };
}
