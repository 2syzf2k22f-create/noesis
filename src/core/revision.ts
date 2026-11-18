// The revision timetable: plans sessions into your free time and keeps the plan honest.
//  - Availability per weekday (your study windows), minus lessons, events, workouts and existing sessions.
//  - What to revise comes from the rest of School: spec confidence, upcoming tests (sooner = more), spaced
//    repetition due counts, unresolved mistakes, question scores, how long since you last touched it, homework.
//  - Methods follow confidence: learn it (lesson) -> practise questions -> exam/past-paper style; plus daily reviews.
//  - Adaptive: sessions you didn't do are marked missed and moved to the next free slot; sessions you've
//    effectively done already (study logged, lessons, questions on that topic) are ticked off automatically;
//    topics you've got ahead on are thinned out. Everything records WHY it's there.
import { nowIso, type Row, type Store } from "./store";
import { dowOf, ukTime } from "./tests";

export type Window = { start: string; end: string };
export type RevisionSettings = {
  availability: Record<string, Window[]>; // "1".."7" (Mon..Sun)
  session_min: number; break_min: number; max_per_day_min: number; rest_days: number[];
  strategy: "balanced" | "weakest" | "tests" | "interleaved"; subject_weights: Record<string, number>;
  methods: string[]; include_sr: boolean; include_homework: boolean; days_ahead: number; earliest: string; latest: string;
};
export const DEFAULT_REVISION: RevisionSettings = {
  availability: { "1": [{ start: "16:45", end: "18:15" }, { start: "19:15", end: "20:45" }], "2": [{ start: "17:30", end: "18:30" }, { start: "19:30", end: "20:45" }], "3": [{ start: "17:45", end: "19:15" }, { start: "19:45", end: "20:45" }], "4": [{ start: "17:30", end: "18:30" }, { start: "19:30", end: "20:45" }], "5": [{ start: "16:45", end: "18:00" }], "6": [{ start: "10:00", end: "12:30" }, { start: "15:00", end: "17:30" }], "7": [{ start: "10:30", end: "12:30" }, { start: "13:00", end: "15:00" }] },
  session_min: 45, break_min: 10, max_per_day_min: 180, rest_days: [], strategy: "balanced",
  subject_weights: { Maths: 1, "Further Maths": 1, Physics: 1, Economics: 1 },
  methods: ["lesson", "questions", "exam", "flashcards", "blurt", "past paper"], include_sr: true, include_homework: true, days_ahead: 14, earliest: "07:00", latest: "21:30",
};
export async function revisionSettings(store: Store): Promise<RevisionSettings> {
  const d = (await store.get("settings", "main").catch(() => null))?.data ?? {};
  return { ...DEFAULT_REVISION, ...(d.revision ?? {}), subject_weights: { ...DEFAULT_REVISION.subject_weights, ...(d.revision?.subject_weights ?? {}) } };
}

const mins = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + (m || 0); };
const hm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const nowMin = () => mins(new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }));

/** Busy intervals per date: lessons (Week A/B aware), events, workouts/recurring rules, existing sessions. */
async function busyMap(store: Store, from: string, to: string, exclude = new Set<string>()) {
  const [tt, ev, rr, plan, st] = await Promise.all([
    store.list("timetable", { limit: 500 }).catch(() => [] as Row[]), store.list("events", { limit: 1000 }).catch(() => [] as Row[]),
    store.list("recurring_reminders", { limit: 100 }).catch(() => [] as Row[]), store.list("plan_items", { limit: 3000 }).catch(() => [] as Row[]),
    store.get("settings", "main").catch(() => null),
  ]);
  const { anchorOf, weekOf } = await import("./schoolWeek");
  const anchor = anchorOf(st?.data);
  const busy = new Map<string, [number, number, string][]>();
  const add = (d: string, a: number, b: number, why: string) => busy.set(d, [...(busy.get(d) ?? []), [a, b, why]]);
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wk = weekOf(new Date(`${d}T12:00:00Z`), anchor);
    for (const l of tt) if (Number(l.day) === dowOf(d) && (!l.week || l.week === wk)) add(d, mins(l.start), mins(l.end), String(l.subject ?? "lesson"));
    for (const r of rr) if (r.active !== false && Number(r.weekday) === dowOf(d) && r.kind !== "study") add(d, mins(r.start), r.end_time ? mins(r.end_time) : mins(r.start) + 60, r.label);
  }
  for (const e of ev) {
    const d = new Date(e.at).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    if (d < from || d > to) continue;
    const a = mins(new Date(e.at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" }));
    const b = e.end_at ? mins(new Date(e.end_at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })) : a + 60;
    add(d, a, Math.max(b, a + 30), e.title);
  }
  for (const p of plan) if (!exclude.has(p.id) && p.start_time && String(p.date) >= from && String(p.date) <= to && !["missed", "skipped"].includes(p.status)) add(String(p.date).slice(0, 10), mins(p.start_time), p.end_time ? mins(p.end_time) : mins(p.start_time) + Number(p.minutes ?? 45), "session");
  return busy;
}
/** Free slots of `len` minutes on a date inside its study windows. */
function slotsOn(date: string, s: RevisionSettings, busy: [number, number, string][], len: number) {
  if (s.rest_days.includes(dowOf(date))) return [];
  const out: [number, number][] = [];
  const floor = date === today() ? nowMin() + 10 : 0;
  for (const w of s.availability[String(dowOf(date))] ?? []) {
    let t = Math.max(mins(w.start), floor, mins(s.earliest));
    const end = Math.min(mins(w.end), mins(s.latest));
    while (t + len <= end) {
      const clash = busy.find(([a, b]) => t < b + 5 && t + len > a - 5);
      if (clash) { t = clash[1] + 5; continue; }
      out.push([t, t + len]); t += len + s.break_min;
    }
  }
  return out;
}

type Cand = { subject: string; code: string | null; topic: string; score: number; confidence: number | null; why: string[]; test?: { title: string; days: number } };
/** What deserves revision, scored from everything School knows. */
export async function candidates(store: Store, s: RevisionSettings) {
  const { specWithEvidence } = await import("./spec");
  const spec = (await specWithEvidence(store).catch(() => [] as Row[])) as Row[];
  const [tests, topics, mistakes, sess, sr] = await Promise.all([
    store.list("upcoming_tests", { limit: 100 }).catch(() => [] as Row[]), store.list("upcoming_test_topics", { limit: 2000 }).catch(() => [] as Row[]),
    store.list("mistakes", { limit: 2000 }).catch(() => [] as Row[]), store.list("study_sessions", { order: { col: "created_at", asc: false }, limit: 2000 }).catch(() => [] as Row[]),
    store.list("sr_items", { limit: 20000 }).catch(() => [] as Row[]),
  ]);
  const t0 = today();
  const live = tests.filter((t) => !t.deleted_at && t.status === "upcoming" && String(t.date).slice(0, 10) >= t0);
  const testOf = (subject: string, code: string) => {
    let best: { title: string; days: number } | undefined;
    for (const t of live) if (t.subject === subject) for (const tp of topics.filter((x) => x.test_id === t.id)) for (const c of tp.spec_codes ?? []) if (code === c || code.startsWith(c)) { const days = Math.round((Date.parse(String(t.date).slice(0, 10)) - Date.parse(t0)) / 864e5); if (!best || days < best.days) best = { title: t.title, days }; }
    return best;
  };
  // group level-4 statements under their level-3 heading (a session-sized chunk)
  const heads = new Map<string, Row[]>();
  for (const p of spec) {
    if (p.level !== 4 || (p.optional && !p.chosen) || !(s.subject_weights[p.subject] ?? 1)) continue;
    const parent = spec.filter((h) => h.subject === p.subject && h.level < 4 && String(p.code).startsWith(String(h.code))).sort((a, b) => b.level - a.level)[0];
    const k = `${p.subject}|${parent?.code ?? p.code}`;
    heads.set(k, [...(heads.get(k) ?? []), { ...p, _head: parent }]);
  }
  const out: Cand[] = [];
  for (const [k, ps] of heads) {
    const [subject, code] = k.split("|");
    const head = ps[0]._head;
    const conf = ps.map((p) => Number(p.confidence ?? 2)).reduce((a, b) => a + b, 0) / ps.length;
    const why: string[] = [];
    let score = (6 - conf) / 5; if (conf <= 2.5) why.push(`confidence ${conf.toFixed(1)}/5`);
    const test = ps.map((p) => testOf(subject, String(p.code))).filter(Boolean).sort((a, b) => a!.days - b!.days)[0];
    if (test) { score *= 1 + Math.max(0, (28 - test.days) / 28) * (s.strategy === "tests" ? 3 : 2); why.push(`on ${test.title} in ${test.days} day${test.days === 1 ? "" : "s"}`); }
    const miss = mistakes.filter((m) => !m.resolved && m.subject === subject && m.spec_code && String(m.spec_code).startsWith(code)).length;
    if (miss) { score += 0.15 * Math.min(4, miss); why.push(`${miss} unresolved mistake${miss > 1 ? "s" : ""}`); }
    const due = sr.filter((i) => i.deck === subject && i.spec_code && String(i.spec_code).startsWith(code) && i.due_at && Date.parse(i.due_at) < Date.now() + 864e5).length;
    if (due) { score += 0.05 * Math.min(10, due); why.push(`${due} review${due > 1 ? "s" : ""} due`); }
    const last = sess.find((x) => x.subject === subject && ((x.spec_code && String(x.spec_code).startsWith(code)) || (head?.title && String(x.topic ?? "").toLowerCase().includes(String(head.title).toLowerCase()))));
    const stale = last ? (Date.now() - Date.parse(last.created_at)) / 864e5 : 60;
    if (stale > 14) { score += Math.min(0.3, stale / 200); why.push(last ? `not touched for ${Math.round(stale)} days` : "never revised here"); }
    if (s.strategy === "weakest") score *= (6 - conf) / 3;
    score *= s.subject_weights[subject] ?? 1;
    out.push({ subject, code, topic: head?.title ?? ps[0].title ?? code, score, confidence: Math.round(conf * 10) / 10, why, test });
  }
  return out.sort((a, b) => b.score - a.score);
}
const methodFor = (c: Cand, s: RevisionSettings) => {
  const m = (c.confidence ?? 2) <= 2.2 ? "lesson" : (c.confidence ?? 3) <= 3.5 ? "questions" : c.test && c.test.days <= 7 ? "exam" : "past paper";
  return s.methods.includes(m) ? m : s.methods[0] ?? "questions";
};

/** Build sessions from tomorrow (or later today) for `days_ahead` days. Manual and locked sessions stay. */
export async function generateRevision(store: Store, over: Partial<RevisionSettings> = {}, opts: { from?: string; replace?: boolean; proposed?: boolean } = {}) {
  const s = { ...(await revisionSettings(store)), ...over };
  const from = opts.from ?? today(), to = addDays(from, Math.max(1, s.days_ahead) - 1);
  const existing = await store.list("plan_items", { limit: 3000 });
  for (const p of existing) if (p.status === "proposed" && String(p.date) >= from) await store.remove("plan_items", p.id);
  if (opts.replace !== false && !opts.proposed) for (const p of existing) if (p.source === "generated" && !p.locked && p.status === "planned" && String(p.date) >= from) await store.remove("plan_items", p.id);
  // a proposal is planned as if the generated sessions it would replace weren't there
  const busy = await busyMap(store, from, to, opts.proposed ? new Set(existing.filter((p) => p.source === "generated" && !p.locked && p.status === "planned").map((p) => p.id)) : undefined);
  const cands = await candidates(store, s);
  const hw = s.include_homework ? (await store.list("homework", { limit: 300 }).catch(() => [] as Row[])).filter((h) => !h.deleted_at && h.status !== "done" && h.due_at && Date.parse(h.due_at) > Date.now()) : [];
  const used = new Map<string, number>(); // minutes per date
  for (const p of (await store.list("plan_items", { limit: 3000 })).filter((p) => String(p.date) >= from && p.status !== "missed" && !(opts.proposed && p.source === "generated" && !p.locked))) used.set(String(p.date).slice(0, 10), (used.get(String(p.date).slice(0, 10)) ?? 0) + Number(p.minutes ?? 0));
  const heat = new Map<string, number>(); // repeated picks cool down
  let created = 0, lastSubject = "";
  const rows: Record<string, unknown>[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    // daily spaced-repetition reviews first, short
    if (s.include_sr && !s.rest_days.includes(dowOf(d))) {
      const sl = slotsOn(d, s, busy.get(d) ?? [], 15)[0];
      if (sl && !existing.some((p) => String(p.date).slice(0, 10) === d && p.method === "reviews" && p.status !== "missed")) { rows.push({ date: d, start_time: hm(sl[0]), end_time: hm(sl[1]), minutes: 15, subject: null, topic: "Due reviews (all subjects)", method: "reviews", kind: "review", reason: "spaced repetition: keep the daily queue at zero", source: "generated", status: "planned", done: false }); busy.set(d, [...(busy.get(d) ?? []), [sl[0], sl[1], "reviews"]]); used.set(d, (used.get(d) ?? 0) + 15); }
    }
    // homework due in the next 2 days gets a slot before it's due
    for (const h of hw) {
      const due = new Date(h.due_at).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      if (due <= d || addDays(d, 2) < due || rows.some((r) => r.homework_id === h.id) || existing.some((p) => p.notes === `homework:${h.id}`)) continue;
      const sl = slotsOn(d, s, busy.get(d) ?? [], s.session_min)[0];
      if (!sl || (used.get(d) ?? 0) + s.session_min > s.max_per_day_min) continue;
      rows.push({ date: d, start_time: hm(sl[0]), end_time: hm(sl[1]), minutes: s.session_min, subject: h.subject ?? null, topic: `Homework: ${h.title}`, method: "homework", kind: "homework", reason: `due ${new Date(h.due_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`, source: "generated", status: "planned", done: false, notes: `homework:${h.id}`, homework_id: h.id });
      busy.set(d, [...(busy.get(d) ?? []), [sl[0], sl[1], "homework"]]); used.set(d, (used.get(d) ?? 0) + s.session_min);
    }
    for (const sl of slotsOn(d, s, busy.get(d) ?? [], s.session_min)) {
      if ((used.get(d) ?? 0) + s.session_min > s.max_per_day_min) break;
      const ranked = cands.filter((c) => !c.test || c.test.days >= Math.round((Date.parse(d) - Date.parse(from)) / 864e5)) // nothing for a test after it's happened
        .map((c) => ({ c, v: c.score / (1 + (heat.get(`${c.subject}|${c.code}`) ?? 0)) * ((s.strategy === "interleaved" || s.strategy === "balanced") && c.subject === lastSubject ? 0.55 : 1) }))
        .sort((a, b) => b.v - a.v);
      const pick = ranked[0]?.c;
      if (!pick) break;
      heat.set(`${pick.subject}|${pick.code}`, (heat.get(`${pick.subject}|${pick.code}`) ?? 0) + 1.2);
      lastSubject = pick.subject;
      rows.push({ date: d, start_time: hm(sl[0]), end_time: hm(sl[1]), minutes: s.session_min, subject: pick.subject, topic: pick.topic, spec_code: pick.code, method: methodFor(pick, s), kind: methodFor(pick, s) === "lesson" ? "learn" : "practice", priority: Math.round(pick.score * 100) / 100, reason: pick.why.join(" · ") || "keeps everything ticking over", source: "generated", status: "planned", done: false });
      busy.set(d, [...(busy.get(d) ?? []), [sl[0], sl[1], "session"]]);
      used.set(d, (used.get(d) ?? 0) + s.session_min);
    }
  }
  for (const r of rows) { const { homework_id: _h, ...row } = r; void _h; await store.insert("plan_items", opts.proposed ? { ...row, status: "proposed" } : row); created++; }
  const st = await store.get("settings", "main");
  await store.update("settings", "main", { data: { ...(st?.data ?? {}), revision: { ...s, ...(over ?? {}) }, revision_generated_at: nowIso() } });
  return { created, from, to, top: cands.slice(0, 8).map((c) => ({ subject: c.subject, topic: c.topic, code: c.code, why: c.why })) };
}

/** Keep the plan true to what happened: tick off what's done, move what's missed, thin out what you're ahead on. */
export async function rebalance(store: Store) {
  const s = await revisionSettings(store);
  const t0 = today(), nm = nowMin();
  const [plan, sess, lessons, attempts] = await Promise.all([
    store.list("plan_items", { limit: 3000 }), store.list("study_sessions", { order: { col: "created_at", asc: false }, limit: 1000 }).catch(() => [] as Row[]),
    store.list("lessons", { limit: 500 }).catch(() => [] as Row[]), store.list("question_attempts", { order: { col: "created_at", asc: false }, limit: 2000 }).catch(() => [] as Row[]),
  ]);
  const dayOf = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const workOn = (date: string, p: Row) => {
    const match = (subj?: string, code?: string | null, topic?: string | null) => subj === p.subject && (!p.spec_code || !code || String(code).startsWith(String(p.spec_code)) || String(p.spec_code).startsWith(String(code)) || (topic && p.topic && String(topic).toLowerCase().includes(String(p.topic).toLowerCase().slice(0, 12))));
    const m1 = sess.filter((x) => dayOf(x.created_at) === date && match(x.subject, x.spec_code, x.topic)).reduce((a, x) => a + Number(x.minutes ?? 0), 0);
    const m2 = lessons.filter((x) => dayOf(x.updated_at ?? x.created_at) === date && match(x.subject, (x.chunks ?? [])[0]?.code, x.topic)).reduce((a, x) => a + Math.max(10, Number(x.minutes ?? 0)), 0);
    const m3 = attempts.filter((x) => dayOf(x.created_at) === date && match(x.subject, x.spec_code, x.topic)).length * 4;
    return m1 + m2 + m3;
  };
  let ticked = 0, missed = 0, moved = 0, thinned = 0;
  for (const p of plan) {
    if (p.status !== "planned") continue;
    const d = String(p.date).slice(0, 10);
    const over = d < t0 || (d === t0 && p.end_time && mins(p.end_time) + 60 < nm);
    if (p.method === "reviews") {
      if (!over) continue;
      const n = (await store.list("sr_reviews", { order: { col: "reviewed_at", asc: false }, limit: 500 }).catch(() => [] as Row[])).filter((r) => dayOf(r.reviewed_at) === d).length;
      await store.update("plan_items", p.id, n >= 5 ? { status: "done", done: true, done_minutes: Math.round(n / 3), reason: `${n} reviews done` } : { status: "missed", reason: "no reviews that day" });
      if (n >= 5) ticked++; else missed++;
      continue;
    }
    const w = p.subject ? workOn(d, p) : 0;
    if (w >= Number(p.minutes ?? 45) * 0.6) { await store.update("plan_items", p.id, { status: "done", done: true, done_minutes: w, reason: `${p.reason ? `${p.reason} · ` : ""}done (${w} min logged)` }); ticked++; continue; }
    if (!over) continue;
    await store.update("plan_items", p.id, w > 0 ? { status: "partial", done_minutes: w } : { status: "missed" });
    missed++;
    if (w >= Number(p.minutes ?? 45) * 0.6 || p.method === "homework" && p.notes) continue;
    // move it to the next free slot within a week
    const busy = await busyMap(store, t0, addDays(t0, 8));
    for (let dd = t0; dd <= addDays(t0, 7); dd = addDays(dd, 1)) {
      const usedMin = plan.filter((x) => String(x.date).slice(0, 10) === dd && x.status !== "missed").reduce((a, x) => a + Number(x.minutes ?? 0), 0);
      if (usedMin + Number(p.minutes ?? 45) > s.max_per_day_min + 30) continue;
      const sl = slotsOn(dd, s, busy.get(dd) ?? [], Number(p.minutes ?? s.session_min))[0];
      if (!sl) continue;
      await store.insert("plan_items", { date: dd, start_time: hm(sl[0]), end_time: hm(sl[1]), minutes: p.minutes, subject: p.subject, topic: p.topic, spec_code: p.spec_code, method: p.method, kind: p.kind, test_id: p.test_id ?? null, priority: Number(p.priority ?? 1) + 0.2, reason: `moved from ${new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} (${w > 0 ? "only partly done" : "missed"})`, moved_from: d, source: "generated", status: "planned", done: false });
      moved++; plan.push({ id: "", date: dd, minutes: p.minutes, status: "planned" } as Row);
      break;
    }
  }
  // ahead: a topic you've done today/yesterday beyond the plan thins its next generated session this week
  const recent = sess.filter((x) => Date.now() - Date.parse(x.created_at) < 2 * 864e5 && x.subject);
  for (const p of plan.filter((x) => x.status === "planned" && x.source === "generated" && !x.locked && String(x.date) > t0 && String(x.date) <= addDays(t0, 7))) {
    const done = recent.filter((x) => x.subject === p.subject && ((x.spec_code && p.spec_code && String(x.spec_code).startsWith(String(p.spec_code))) || (x.topic && p.topic && String(x.topic).toLowerCase() === String(p.topic).toLowerCase()))).reduce((a, x) => a + Number(x.minutes ?? 0), 0);
    if (done >= Number(p.minutes ?? 45) && !String(p.reason ?? "").includes("ahead")) { await store.update("plan_items", p.id, { minutes: 20, end_time: p.start_time ? hm(mins(p.start_time) + 20) : p.end_time, method: "questions", reason: `you're ahead: ${done} min on this already, so this is a 20-min check` }); thinned++; }
  }
  const st = await store.get("settings", "main");
  await store.update("settings", "main", { data: { ...(st?.data ?? {}), revision_rebalanced_at: nowIso() } });
  return { ticked, missed, moved, thinned };
}

/** Week view data: sessions, lessons, busy blocks, tests, homework, stats. */
export async function revisionWeek(store: Store, from: string) {
  const to = addDays(from, 6);
  const [plan, tests, hw, busy, s] = await Promise.all([
    store.list("plan_items", { limit: 3000 }), store.list("upcoming_tests", { limit: 100 }).catch(() => [] as Row[]),
    store.list("homework", { limit: 300 }).catch(() => [] as Row[]), busyMap(store, from, to, new Set((await store.list("plan_items", { limit: 3000 })).map((p) => p.id))),
    revisionSettings(store),
  ]);
  const inWeek = plan.filter((p) => String(p.date).slice(0, 10) >= from && String(p.date).slice(0, 10) <= to);
  const sum = (rows: Row[], f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
  const bySubject: Record<string, { planned: number; done: number }> = {};
  for (const p of inWeek) { const k = p.subject ?? "Reviews"; bySubject[k] ??= { planned: 0, done: 0 }; bySubject[k].planned += Number(p.minutes ?? 0); if (p.status === "done") bySubject[k].done += Number(p.done_minutes ?? p.minutes ?? 0); }
  const past = inWeek.filter((p) => String(p.date) < today() || p.status !== "planned");
  return {
    from, to, settings: s,
    sessions: inWeek.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.start_time ?? "").localeCompare(String(b.start_time ?? ""))),
    busy: Object.fromEntries([...busy.entries()].map(([d, v]) => [d, v.map(([a, b, why]) => ({ start: hm(a), end: hm(b), why }))])),
    tests: tests.filter((t) => !t.deleted_at && String(t.date).slice(0, 10) >= from && String(t.date).slice(0, 10) <= to).map((t) => ({ id: t.id, title: t.title, date: String(t.date).slice(0, 10), start: t.start_time })),
    homework: hw.filter((h) => !h.deleted_at && h.due_at && h.status !== "done").map((h) => ({ id: h.id, title: h.title, subject: h.subject, due: new Date(h.due_at).toLocaleDateString("en-CA", { timeZone: "Europe/London" }) })).filter((h) => h.due >= from && h.due <= to),
    stats: { planned_min: sum(inWeek, (p) => Number(p.minutes ?? 0)), done_min: sum(inWeek.filter((p) => p.status === "done"), (p) => Number(p.done_minutes ?? p.minutes ?? 0)), completion: past.length ? Math.round((past.filter((p) => p.status === "done").length / past.length) * 100) : null, missed: inWeek.filter((p) => p.status === "missed").length, by_subject: bySubject },
  };
}
export const revisionHelpers = { addDays, today, mins, hm };
export { ukTime };

/** Morning briefing (inbox + phone push if on): today's sessions, tests in the next 3 days, reviews due. */
export async function dailyBrief(store: Store) {
  const d = today();
  const id = `brief:${d}`;
  if ((await store.list("inbox_items", { eq: { external_id: id }, limit: 1 })).length) return 0;
  const plan = (await store.list("plan_items", { limit: 3000 })).filter((p) => String(p.date).slice(0, 10) === d && p.status === "planned").sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")));
  const tests = (await store.list("upcoming_tests", { limit: 100 }).catch(() => [] as Row[])).filter((t) => !t.deleted_at && t.status === "upcoming" && String(t.date).slice(0, 10) >= d && String(t.date).slice(0, 10) <= addDays(d, 3));
  const due = (await store.list("sr_items", { limit: 20000 }).catch(() => [] as Row[])).filter((i) => !i.suspended && i.state !== "new" && i.due_at && Date.parse(i.due_at) < Date.now() + 18 * 3600e3).length;
  if (!plan.length && !tests.length && !due) return 0;
  const st = (await store.get("settings", "main").catch(() => null))?.data ?? {};
  const at = ukTime(d, st.revision?.brief_time ?? st.sr?.nudge_time ?? "07:30");
  const mins = plan.reduce((a, p) => a + Number(p.minutes ?? 0), 0);
  await store.insert("inbox_items", {
    external_id: id, source: "Apollo", link: "/s/school/planner", deliver_at: new Date(Math.max(Date.now(), at.getTime())).toISOString(), read_at: null, deleted_at: null,
    title: `Today: ${plan.length} session${plan.length === 1 ? "" : "s"}${mins ? ` (${Math.round(mins / 6) / 10} h)` : ""}${tests.length ? ` · ${tests.length} test${tests.length > 1 ? "s" : ""} soon` : ""}${due ? ` · ${due} reviews` : ""}`,
    body: [...plan.map((p) => `${p.start_time ?? "any time"} ${p.subject ? `${p.subject}: ` : ""}${p.topic} (${p.method ?? "revise"}, ${p.minutes} min)`), ...tests.map((t) => `📝 ${t.title} on ${new Date(`${String(t.date).slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long" })}${t.start_time ? ` at ${t.start_time}` : ""}`), due ? `🔁 ${due} reviews due` : ""].filter(Boolean).join("\n"),
  });
  return 1;
}

/** Accept or throw away Apollo's proposed sessions (from the Thursday/Sunday review). */
export async function decideProposal(store: Store, accept: boolean) {
  const all = await store.list("plan_items", { limit: 3000 });
  const prop = all.filter((p) => p.status === "proposed");
  if (accept && prop.length) {
    const from = prop.map((p) => String(p.date)).sort()[0];
    for (const p of all) if (p.status === "planned" && p.source === "generated" && !p.locked && String(p.date) >= from) await store.remove("plan_items", p.id);
    for (const p of prop) await store.update("plan_items", p.id, { status: "planned" });
  } else for (const p of prop) await store.remove("plan_items", p.id);
  return { [accept ? "accepted" : "discarded"]: prop.length };
}

/** Thursday and Sunday evenings: how the last days went vs the plan, and a proposed plan for the next 7 days to approve. */
export async function weeklyReview(store: Store) {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  if (![0, 4].includes(now.getDay()) || now.getHours() < 18) return 0;
  const d = today(), id = `review:${d}`;
  if ((await store.list("inbox_items", { eq: { external_id: id }, limit: 1 })).length) return 0;
  await rebalance(store).catch(() => null);
  const since = addDays(d, now.getDay() === 0 ? -3 : -4);
  const past = (await store.list("plan_items", { limit: 3000 })).filter((p) => String(p.date) >= since && String(p.date) <= d && p.status !== "proposed");
  const done = past.filter((p) => p.status === "done"), missed = past.filter((p) => p.status === "missed");
  const mins = (r: Row[]) => r.reduce((a, p) => a + Number(p.done_minutes ?? p.minutes ?? 0), 0);
  const subj: Record<string, [number, number]> = {};
  for (const p of past) { const k = p.subject ?? "Reviews"; subj[k] ??= [0, 0]; subj[k][1] += Number(p.minutes ?? 0); if (p.status === "done") subj[k][0] += Number(p.done_minutes ?? p.minutes ?? 0); }
  const r = await generateRevision(store, { days_ahead: 7 }, { from: addDays(d, 1), proposed: true });
  await store.insert("inbox_items", { external_id: id, source: "Apollo", link: "/s/school/planner", deliver_at: nowIso(), read_at: null, deleted_at: null,
    title: `${now.getDay() === 0 ? "Sunday" : "Thursday"} review: ${done.length}/${past.length} sessions done · next week proposed (${r.created})`,
    body: [`Done ${Math.round(mins(done) / 6) / 10} h of ${Math.round(past.reduce((a, p) => a + Number(p.minutes ?? 0), 0) / 6) / 10} h planned; ${missed.length} missed (moved).`, ...Object.entries(subj).map(([k, [a, b]]) => `${k}: ${a}/${b} min`), `Proposed: ${r.created} sessions for the next 7 days. Top priorities: ${r.top.slice(0, 3).map((t) => `${t.subject} ${t.topic}`).join(", ")}. Open the timetable to approve or discard.`].join("\n") });
  return 1;
}

/** Optional (on by default; settings.data.revision.exam_eve = false turns it off): 18:00 the day before a test, a recap
 *  of the weakest statements and their exam-scope items on it. */
export async function examEve(store: Store) {
  const st = (await store.get("settings", "main").catch(() => null))?.data ?? {};
  if (st.revision?.exam_eve === false) return 0;
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  if (now.getHours() < 18) return 0;
  const tomorrow = addDays(today(), 1);
  let n = 0;
  for (const t of (await store.list("upcoming_tests", { limit: 100 }).catch(() => [] as Row[])).filter((x) => !x.deleted_at && x.status === "upcoming" && String(x.date).slice(0, 10) === tomorrow)) {
    const id = `eve:${t.id}`;
    if ((await store.list("inbox_items", { eq: { external_id: id }, limit: 1 })).length) continue;
    const codes = (await store.list("upcoming_test_topics", { eq: { test_id: t.id }, limit: 200 }).catch(() => [] as Row[])).flatMap((x) => x.spec_codes ?? []);
    const pts = (await store.list("spec_points", { eq: { subject: t.subject, level: 4 }, limit: 1000 })).filter((p) => codes.some((c: string) => String(p.code).startsWith(c))).sort((a, b) => Number(a.confidence ?? 3) - Number(b.confidence ?? 3)).slice(0, 6);
    await store.insert("inbox_items", { external_id: id, source: "Apollo", link: `/s/school/tests/${t.id}`, deliver_at: nowIso(), read_at: null, deleted_at: null,
      title: `Tomorrow: ${t.title}. 20-minute recap`,
      body: [`Weakest on this test (do these, then sleep):`, ...pts.map((p) => `• ${p.code} ${String(p.title ?? p.text ?? "").slice(0, 80)}${Array.isArray(p.exam_scope) ? `: ${p.exam_scope.slice(0, 3).map((x: { skill: string }) => x.skill).join("; ")}` : ""}`), `Open the test page for a quick revise lesson and the formula sheet. Aim for bed by 22:30.`].join("\n") });
    n++;
  }
  return n;
}

/** "I've got N minutes": the single best thing to do right now. */
export async function whatNow(store: Store, minutes: number) {
  const due = (await store.list("sr_items", { limit: 20000 }).catch(() => [] as Row[])).filter((i) => !i.suspended && i.state !== "new" && i.due_at && Date.parse(i.due_at) < Date.now()).length;
  const d = today();
  const next = (await store.list("plan_items", { limit: 3000 })).filter((p) => String(p.date).slice(0, 10) === d && p.status === "planned" && Number(p.minutes ?? 45) <= minutes + 10).sort((a, b) => String(a.start_time ?? "").localeCompare(String(b.start_time ?? "")))[0];
  if (minutes <= 15 || (due >= 30 && minutes <= 30)) return { kind: "reviews", label: `${due} reviews due: clear the oldest`, why: "short gap: reviews give the most per minute", href: "/s/review?review=all" };
  if (next) return { kind: "session", label: `${next.subject ? `${next.subject}: ` : ""}${next.topic} (${next.method})`, why: `already in today's plan${next.reason ? ` · ${next.reason}` : ""}`, href: "/s/school/planner", id: next.id };
  const c = (await candidates(store, await revisionSettings(store)))[0];
  if (!c) return { kind: "reviews", label: "Due reviews", why: "nothing else stands out", href: "/s/review?review=all" };
  return { kind: "lesson", label: `${c.subject}: ${c.topic}`, why: c.why.join(" · ") || "highest priority", href: `/s/school/tutor?new=${encodeURIComponent(`${c.subject}|${c.code ?? c.topic}|${(c.confidence ?? 3) <= 2.2 ? "teach" : "revise"}`)}` };
}
