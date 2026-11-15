// Upcoming tests: lesson matching (Week A/B), readiness from the spec, automatic reminders, a revision plan
// around study hours, clash warnings and calendar export. Every number here is computed, never typed.
import { nowIso, type Row, type Store } from "./store";
import { anchorOf, inWeek, weekOf } from "./schoolWeek";
import { hasEvidence, specWithEvidence, type SpecRow } from "./spec";

export const STUDY_HOURS_DEFAULT = [{ day: 1, start: "16:45", end: "17:45" }, { day: 3, start: "17:45", end: "18:45" }, { day: 6, start: "15:00", end: "16:00" }, { day: 7, start: "13:00", end: "14:00" }];
const BOUNDS: [string, number][] = [["A*", 80], ["A", 70], ["B", 60], ["C", 50], ["D", 40], ["E", 30]];
export const gradeOf = (pct: number) => BOUNDS.find(([, b]) => pct >= b)?.[0] ?? "U";

/** UK wall-clock time on a date -> the real instant (handles GMT/BST). */
export function ukTime(date: string, hm: string) {
  const [y, m, d] = date.split("-").map(Number), [H, M] = hm.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, H, M);
  const london = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/London" }));
  const utc = new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess - (london.getTime() - utc.getTime()));
}
export const dowOf = (date: string) => { const d = new Date(`${date}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
export const daysUntil = (date: string) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" })}T00:00:00Z`)) / 864e5);

/** The timetable lesson for a subject on a date (Week A/B aware). */
export async function lessonFor(store: Store, subject: string, date: string, time?: string | null) {
  const st = await store.get("settings", "main").catch(() => null);
  const wk = weekOf(new Date(`${date}T12:00:00Z`), anchorOf(st?.data));
  const rows = (await store.list("timetable", { limit: 500 })).filter((t) => Number(t.day) === dowOf(date) && inWeek(t, wk) && String(t.subject ?? "").toLowerCase() === subject.toLowerCase());
  rows.sort((a, b) => String(a.start).localeCompare(String(b.start)));
  return { week: wk, lesson: (time ? rows.find((r) => r.start <= time && r.end > time) : null) ?? rows[0] ?? null };
}

/** Spec rows for a topic's codes: a code covers itself and anything under it (4.02 covers 4.02a…). */
function rowsFor(spec: SpecRow[], subject: string, codes: string[]) {
  return spec.filter((p) => p.subject === subject && codes.some((c) => p.code === c || (p.level === 4 && (p.code.startsWith(`${c}.`) || (p.code.startsWith(c) && /^[a-z]$/.test(p.code.slice(c.length)))))));
}

export async function testDetail(store: Store, id: string, specIn?: SpecRow[]) {
  const t = await store.get("upcoming_tests", id);
  if (!t || t.deleted_at) return null;
  const spec = specIn ?? await specWithEvidence(store, t.subject);
  const [topics, sessions, cards, hw] = await Promise.all([
    store.list("upcoming_test_topics", { eq: { test_id: id }, limit: 200 }),
    store.list("study_sessions", { order: { col: "created_at", asc: false }, limit: 3000 }).catch(() => [] as Row[]),
    store.list("reviews", { order: { col: "created_at", asc: false }, limit: 3000 }).catch(() => [] as Row[]),
    store.list("homework", { limit: 500 }).catch(() => [] as Row[]),
  ]);
  void cards;
  const out = topics.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((tp) => {
    const codes: string[] = tp.spec_codes ?? [];
    const rows = rowsFor(spec, t.subject, codes);
    const statements = rows.filter((r) => r.level === 4);
    const ev = statements.reduce((a, r) => ({ cards: a.cards + r.evidence.cards, questions: a.questions + r.evidence.questions, attempts: a.attempts + r.evidence.attempts, mistakes: a.mistakes + r.evidence.mistakes, pctSum: a.pctSum + (r.evidence.attempt_pct ?? 0) * r.evidence.attempts, minutes: a.minutes + r.evidence.minutes }), { cards: 0, questions: 0, attempts: 0, mistakes: 0, pctSum: 0, minutes: 0 });
    const rated = statements.filter((r) => r.confidence != null);
    const conf = tp.confidence ?? (rated.length ? rated.reduce((a, r) => a + Number(r.confidence), 0) / rated.length : null);
    const topicMinutes = sessions.filter((s) => s.subject === t.subject && (codes.includes(String(s.spec_code ?? "")) || String(s.topic ?? "").toLowerCase() === String(tp.label).toLowerCase())).reduce((a, s) => a + Number(s.minutes ?? 0), 0);
    const attemptPct = ev.attempts ? ev.pctSum / ev.attempts : null;
    // readiness 0-100: confidence 50%, attempts 30%, evidence coverage 20%, minus open mistakes
    const coverage = statements.length ? statements.filter((r) => hasEvidence(r.evidence)).length / statements.length : (ev.cards + ev.questions ? 1 : 0);
    const parts: [number | null, number][] = [[conf == null ? null : ((conf - 1) / 4) * 100, 0.5], [attemptPct, 0.3], [coverage * 100, 0.2]];
    const w = parts.filter(([v]) => v != null).reduce((a, [, x]) => a + x, 0);
    const readiness = w ? Math.max(0, Math.round(parts.filter(([v]) => v != null).reduce((a, [v, x]) => a + (v as number) * x, 0) / w - Math.min(15, ev.mistakes * 3))) : 0;
    const lastRev = [...rows.map((r) => r.last_reviewed_at), ...sessions.filter((s) => codes.includes(String(s.spec_code ?? ""))).map((s) => s.created_at)].filter(Boolean).sort().pop() ?? null;
    const topic = {
      ...tp, codes, readiness, confidence: conf == null ? null : Math.round(conf * 10) / 10, evidence: { ...ev, attempt_pct: attemptPct == null ? null : Math.round(attemptPct) },
      unverified: rows.filter((r) => !r.verified).map((r) => r.code), missing: codes.filter((c) => !rows.some((r) => r.code === c || r.code.startsWith(c))),
      statements: statements.map((r) => ({ id: r.id, code: r.code, title: r.title, text: r.text, verified: r.verified, confidence: r.confidence, evidence: r.evidence })),
      headings: rows.filter((r) => r.level < 4).map((r) => ({ code: r.code, title: r.title, verified: r.verified })),
      minutes: topicMinutes + ev.minutes, last_revised: lastRev,
    };
    return topic as typeof topic & Row;
  });
  const readiness = out.length ? Math.round(out.reduce((a, x) => a + x.readiness, 0) / out.length) : 0;
  const days = daysUntil(String(t.date));
  const base = {
    ...t, date: String(t.date).slice(0, 10), days, topics: out, readiness, predicted_grade: gradeOf(readiness),
    target_note: t.target_grade ? (gradeOf(readiness) === t.target_grade ? "on target" : `target ${t.target_grade}`) : null,
    homework: hw.filter((h) => !h.deleted_at && (h.test_id === id || (h.subject === t.subject && /revis|assess|test/i.test(String(h.title))))),
    weakest: [...out].sort((a, b) => a.readiness - b.readiness).slice(0, 3).map((x) => ({ id: x.id, label: x.label, readiness: x.readiness })),
  };
  return base as typeof base & Row;
}

/** Create or refresh a test's reminder rows (deleted when the test is moved, cancelled or done). */
export async function syncReminders(store: Store, t: Row) {
  for (const r of await store.list("inbox_items", { eq: { test_id: t.id }, limit: 200 })) if (r.source === "Test reminder" && !r.read_at) await store.remove("inbox_items", r.id);
  if (t.deleted_at || t.status !== "upcoming") return 0;
  const rs = t.reminder_settings ?? { days_before: [7, 3, 1], morning_of: "07:00", nudges: true };
  const date = String(t.date).slice(0, 10), at = ukTime(date, t.start_time ?? "09:00");
  const items: { when: Date; title: string; body: string }[] = [];
  for (const n of rs.days_before ?? []) {
    const d = new Date(Date.parse(`${date}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10);
    items.push({ when: ukTime(d, "17:00"), title: `${t.title} in ${n} day${n === 1 ? "" : "s"}`, body: `${t.subject}, ${new Date(at).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })}${t.room ? `, room ${t.room}` : ""}. Open the test page to revise.` });
  }
  if (rs.morning_of) items.push({ when: ukTime(date, rs.morning_of), title: `${t.title} today${t.start_time ? ` at ${t.start_time}` : ""}`, body: `Good luck. Quick look at your weakest topics on the test page before it starts.` });
  items.push({ when: ukTime(date, "18:00"), title: `How did ${t.title} go?`, body: "Enter your marks per topic and what went wrong on the test page: it saves a School test and logs the mistakes." });
  if (rs.nudges) items.push({ when: ukTime(new Date(Date.parse(`${date}T12:00:00Z`) - 10 * 864e5).toISOString().slice(0, 10), "16:00"), title: `Start revising for ${t.title}`, body: "Press \"Revise for this test\" on the test page; Apollo goes through every topic with you." });
  let n = 0;
  for (const it of items) if (it.when.getTime() > Date.now()) {
    await store.insert("inbox_items", { source: "Test reminder", title: it.title, body: it.body, due_at: at.toISOString(), deliver_at: it.when.toISOString(), link: `/s/school/tests/${t.id}`, test_id: t.id, read_at: null, deleted_at: null });
    n++;
  }
  return n;
}

/** Day-by-day revision plan for all upcoming tests: study-hour slots up to each test, weakest topics first. */
export async function generatePlan(store: Store) {
  const st = await store.get("settings", "main").catch(() => null);
  const hours = (st?.data?.study_hours as typeof STUDY_HOURS_DEFAULT | undefined) ?? STUDY_HOURS_DEFAULT;
  const tests = (await store.list("upcoming_tests", { limit: 100 })).filter((t) => !t.deleted_at && t.status === "upcoming" && daysUntil(String(t.date).slice(0, 10)) >= 0);
  const spec = await specWithEvidence(store);
  const details = (await Promise.all(tests.map((t) => testDetail(store, t.id, spec)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof testDetail>>>[];
  for (const p of await store.list("plan_items", { limit: 2000 })) if (p.test_id && !p.done) await store.remove("plan_items", p.id);
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const last = details.map((d) => d.date).sort().pop();
  if (!last) return { created: 0 };
  const queue = new Map(details.map((d) => [d.id, [...d.topics].sort((a, b) => a.readiness - b.readiness)]));
  let created = 0;
  for (let dt = today; dt < last; dt = new Date(Date.parse(`${dt}T12:00:00Z`) + 864e5).toISOString().slice(0, 10)) {
    for (const h of hours.filter((x) => x.day === dowOf(dt))) {
      if (dt === today && ukTime(dt, h.start).getTime() < Date.now()) continue;
      // the soonest test still ahead of this slot gets it; ties (same-day tests) alternate
      const ahead = details.filter((d) => d.date > dt).sort((a, b) => a.date.localeCompare(b.date) || (created % 2 ? 1 : -1));
      const d = ahead[0];
      if (!d) continue;
      const q = queue.get(d.id)!;
      const tp = q.shift();
      if (!tp) continue;
      q.push(tp); // cycle: weaker topics come round again
      await store.insert("plan_items", { date: dt, subject: d.subject, topic: `${tp.label}${tp.chapter ? ` (${tp.chapter})` : ""}`, minutes: 60, kind: tp.readiness < 50 ? "learn" : "practice", done: false, spec_code: tp.codes[0] ?? null, test_id: d.id });
      created++;
    }
  }
  return { created };
}

/** Same-day tests, and gym sessions the evening before a test. */
export function clashes(tests: Row[], timetable: Row[]) {
  const out: string[] = [];
  const byDate = new Map<string, Row[]>();
  for (const t of tests) byDate.set(String(t.date).slice(0, 10), [...(byDate.get(String(t.date).slice(0, 10)) ?? []), t]);
  for (const [d, ts] of byDate) {
    if (ts.length > 1) out.push(`${ts.map((t) => t.title).join(" and ")} are both on ${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}: the plan splits revision between them.`);
    const eve = dowOf(new Date(Date.parse(`${d}T12:00:00Z`) - 864e5).toISOString().slice(0, 10));
    const gym = timetable.find((t) => Number(t.day) === eve && /gym|workout/i.test(String(t.subject ?? "")));
    if (gym) out.push(`${gym.subject} at ${gym.start} is the evening before ${ts.map((t) => t.title).join(" and ")}: keep it light or move it.`);
  }
  return out;
}

export function ics(tests: Row[]) {
  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const ev = tests.filter((t) => !t.deleted_at && t.status !== "cancelled").map((t) => {
    const date = String(t.date).slice(0, 10), start = ukTime(date, t.start_time ?? "09:00"), end = t.end_time ? ukTime(date, t.end_time) : new Date(start.getTime() + 3600e3);
    return ["BEGIN:VEVENT", `UID:${t.id}@noesis`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(`${t.title}`)}`, t.room ? `LOCATION:${esc(`Room ${t.room}`)}` : "", "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", `DESCRIPTION:${esc(t.title)} tomorrow`, "END:VALARM", "END:VEVENT"].filter(Boolean).join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NOESIS//Tests//EN", ...ev, "END:VCALENDAR"].join("\r\n");
}

/** Topics from chapter names via the stored chapter maps (only for chapters that are mapped). */
export async function topicsFromChapters(store: Store, subject: string, chapters: string[]) {
  const maps = await store.list("chapter_maps", { eq: { subject }, limit: 500 });
  const norm = (c: string) => c.toLowerCase().replace(/^(ch(apter)?\.?\s*)/, "").trim();
  const found: Row[] = [], missing: string[] = [];
  for (const c of chapters) { const m = maps.find((x) => norm(x.chapter) === norm(c) || String(x.label ?? "").toLowerCase() === c.toLowerCase()); if (m) found.push(m); else missing.push(c); }
  return { topics: found.map((m, i) => ({ label: m.label ?? m.chapter, chapter: m.chapter, spec_codes: m.spec_codes ?? [], scope_note: m.scope_note ?? null, sort_order: i + 1 })), missing };
}
export const touch = () => ({ updated_at: nowIso() });

/** Create a test: time/room from the timetable lesson, topics from chapter maps, reminders made. */
export async function createTest(store: Store, b: { subject: string; date: string; title?: string; start_time?: string; end_time?: string; room?: string; total_marks?: number; target_grade?: string; notes?: string; chapters?: string[]; topics?: { label: string; chapter?: string; spec_codes?: string[]; scope_note?: string; excluded?: string }[] }) {
  const { lesson, week } = await lessonFor(store, b.subject, b.date, b.start_time);
  const t = await store.insert("upcoming_tests", {
    title: String(b.title || `${b.subject} test`).slice(0, 80), subject: b.subject, date: b.date,
    start_time: b.start_time || lesson?.start || null, end_time: b.end_time || lesson?.end || null, room: b.room || lesson?.room || null, lesson_id: lesson?.id ?? null, week,
    total_marks: b.total_marks || null, target_grade: b.target_grade || null, notes: b.notes || null, status: "upcoming", deleted_at: null,
  });
  let topics = [...(b.topics ?? [])];
  let missing: string[] = [];
  if (b.chapters?.length) { const r = await topicsFromChapters(store, b.subject, b.chapters); topics = [...topics, ...r.topics]; missing = r.missing; }
  for (const [i, tp] of topics.entries()) await store.insert("upcoming_test_topics", { test_id: t.id, label: tp.label, chapter: tp.chapter ?? null, spec_codes: tp.spec_codes ?? [], scope_note: tp.scope_note ?? null, excluded: tp.excluded ?? null, sort_order: i + 1 });
  const reminders = await syncReminders(store, t);
  return { id: t.id, start_time: t.start_time, room: t.room, week, reminders, missing_chapters: missing, topics: topics.length };
}
