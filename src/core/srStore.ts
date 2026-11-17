// Spaced repetition: keeps sr_items in step with their sources (flashcards, mistakes, questions, spec,
// geography, puzzles, openings), builds review queues, records reviews (with side effects back into the
// source tables), sessions, and status counts. Everything shown in the UI is computed here.
import COUNTRIES from "../data/countries.json";
import { BUILTIN } from "../data/srBuiltin";
import { nowIso, type Row, type Store } from "./store";
import { autoRating, dayEnd, DEFAULT_SR, schedule, studyDay, type Card, type SrSettings } from "./sr";

type Country = { n: string; c: string; r: string; s: string; k: string; a: number };
const ALL = COUNTRIES as Country[];
export const AREA_OF: Record<string, string> = { flashcard: "school", mistake: "school", question: "school", spec: "school", geo: "mind", puzzle: "mind", opening: "mind", palace: "mind", poker: "mind", coding: "mind", vocab: "languages", note: "school" };
const LANGS = ["Mandarin", "Spanish", "French", "English"];
const MIND_DECKS = ["Coding", "Poker", "Memory", "Chess"];
/** Speech-synthesis language for each language deck (listening cards). */
export const LANG_CODE: Record<string, string> = { Mandarin: "zh-CN", Spanish: "es-ES", French: "fr-FR", English: "en-GB" };
export const GEO_MODES = ["flag", "capital", "country-of-capital"] as const;

export async function srSettings(store: Store): Promise<SrSettings> {
  const st = await store.get("settings", "main").catch(() => null);
  return { ...DEFAULT_SR, ...(st?.data?.sr ?? {}) };
}

const card = (r: Row): Card => ({ state: r.state, stability: r.stability, difficulty: r.difficulty, due_at: r.due_at, last_reviewed_at: r.last_reviewed_at, reps: r.reps ?? 0, lapses: r.lapses ?? 0, step: r.step ?? 0 });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const key = (r: Record<string, any>) => `${r.kind}|${r.source_table ?? ""}|${r.source_id ?? ""}|${r.direction ?? ""}`;

/** Create/refresh items from their sources. Cheap enough to run before each queue/status read. */
let lastSync = 0;
/** Throttled: a full sync runs at most once a minute per server instance (it reads every source table). */
export async function syncItems(store: Store, only?: string[], force = false) {
  if (!force && !only && Date.now() - lastSync < 60_000) return 0;
  if (!only) lastSync = Date.now();
  const want = (k: string) => !only || only.includes(k);
  const existing = await store.list("sr_items", { limit: 20000 });
  const have = new Map(existing.map((r) => [key(r), r]));
  const add: Record<string, unknown>[] = [];
  const ensure = (it: { area: string; kind: string; source_table: string; source_id: string; direction?: string; deck?: string | null; topic?: string | null; spec_code?: string | null; payload: Record<string, unknown>; seed?: Partial<Row> }) => {
    const k = key({ ...it, direction: it.direction ?? "" });
    const ex = have.get(k);
    if (ex) { if (JSON.stringify(ex.payload) !== JSON.stringify(it.payload) || ex.spec_code !== (it.spec_code ?? null)) void store.update("sr_items", ex.id, { payload: it.payload, spec_code: it.spec_code ?? null, deck: it.deck ?? null, topic: it.topic ?? null, updated_at: nowIso() }); return; }
    const row = { area: it.area, kind: it.kind, source_table: it.source_table, source_id: it.source_id, direction: it.direction ?? "", deck: it.deck ?? null, topic: it.topic ?? null, spec_code: it.spec_code ?? null, payload: it.payload, state: "new", reps: 0, lapses: 0, step: 0, history: [], suspended: false, leech: false, ...(it.seed ?? {}) };
    add.push(row); have.set(k, { id: "", ...row } as Row);
  };
  if (want("flashcard")) for (const f of await store.list("flashcards", { limit: 10000 })) {
    if (f.deleted_at) continue;
    // migrate the old scheduling so nothing is reset: interval -> stability, ease -> difficulty
    const reps = Number(f.reps ?? 0);
    const seed = reps > 0 ? { state: "review", stability: Math.max(0.5, Number(f.interval_days ?? 1)), difficulty: Math.min(10, Math.max(1, 11 - (Number(f.ease ?? 2.5) - 1.3) * 5)), due_at: f.due_at ?? nowIso(), last_reviewed_at: f.updated_at ?? f.created_at, reps, lapses: Number(f.lapses ?? 0) } : f.due_at ? { due_at: f.due_at } : {};
    const lang = LANGS.includes(String(f.deck));
    ensure({ area: lang ? "languages" : MIND_DECKS.includes(String(f.deck)) ? "mind" : "school", kind: "flashcard", source_table: "flashcards", source_id: f.id, deck: f.deck ?? null, topic: f.topic ?? null, spec_code: f.spec_code ?? null, payload: { front: f.front, back: f.back, deck: f.deck, topic: f.topic }, seed });
    // vocab: recognition (the card as written) first; recall (meaning -> word) and listening (hear it -> meaning)
    // are added once recognition has graduated, so production isn't asked before the word is known
    const rec = have.get(key({ kind: "flashcard", source_table: "flashcards", source_id: f.id, direction: "" }));
    if (lang && rec?.state === "review") {
      ensure({ area: "languages", kind: "flashcard", source_table: "flashcards", source_id: f.id, direction: "recall", deck: f.deck, topic: f.topic ?? null, payload: { front: `${f.deck}: say/write the word for\n\n**${f.back}**`, back: f.front, deck: f.deck, dir: "recall" } });
      ensure({ area: "languages", kind: "flashcard", source_table: "flashcards", source_id: f.id, direction: "listening", deck: f.deck, topic: f.topic ?? null, payload: { front: `${f.deck}: listen 🔊 and give the meaning`, back: `${f.front} = ${f.back}`, listen: f.front, lang: LANG_CODE[String(f.deck)] ?? "en-GB", deck: f.deck, dir: "listening" } });
    }
  }
  if (want("mistake")) for (const m of await store.list("mistakes", { limit: 5000 })) {
    if (m.resolved) continue;
    const lang = LANGS.includes(String(m.subject));
    ensure({ area: lang ? "languages" : "school", kind: "mistake", source_table: "mistakes", source_id: m.id, deck: m.subject ?? null, topic: m.topic ?? null, spec_code: m.spec_code ?? null,
      payload: lang
        ? { front: `${m.subject}: you said\n\n*${m.what}*\n\nHow do you say it correctly?`, back: `${m.fix ?? "(no correction stored)"}${m.why ? `\n\n${m.why}` : ""}` }
        : { front: `${m.subject ?? ""}${m.topic ? ` · ${m.topic}` : ""}: what went wrong here, and how do you avoid it?\n\n${m.what}`, back: `${m.fix ? `Fix: ${m.fix}` : "No fix written yet: say how you'd avoid it."}${m.why ? `\nWhy it happened: ${m.why}` : ""}` } });
  }
  if (want("question")) {
    const attempts = await store.list("question_attempts", { order: { col: "created_at", asc: false }, limit: 5000 });
    const qs = new Map((await store.list("questions", { limit: 5000 })).map((q) => [q.id, q]));
    const latest = new Map<string, Row>();
    for (const a of attempts) if (a.question_id && !latest.has(a.question_id)) latest.set(a.question_id, a);
    for (const [qid, a] of latest) {
      const q = qs.get(qid);
      if (!q || q.deleted_at || Number(a.pct ?? 100) >= 100) continue;
      ensure({ area: "school", kind: "question", source_table: "questions", source_id: qid, deck: q.subject, topic: q.topic, spec_code: q.spec_code ?? a.spec_code ?? null, payload: { front: `${q.question}\n\n[${q.marks} mark${q.marks === 1 ? "" : "s"}] · last time ${a.marks}/${a.total}`, back: q.mark_scheme ?? q.answer ?? "No mark scheme stored." }, seed: { due_at: nowIso() } });
    }
  }
  if (want("spec")) for (const p of await store.list("spec_points", { limit: 10000 })) {
    if (p.deleted_at || p.level !== 4 || (p.optional && !p.chosen)) continue;
    if (p.confidence == null || Number(p.confidence) > 3) continue; // weak or unrated-but-rated-low only
    ensure({ area: "school", kind: "spec", source_table: "spec_points", source_id: p.id, deck: p.subject, topic: p.title ?? null, spec_code: p.code, payload: { front: `${p.subject} ${p.code}${p.title ? ` · ${p.title}` : ""}\nExplain this spec point from memory (what you need to know and be able to do).`, back: `${p.text ?? p.title ?? ""}${p.notes ? `\n\n${p.notes}` : ""}` } });
  }
  if (want("geo")) for (const c of ALL) for (const m of GEO_MODES) {
    if (m !== "flag" && !c.c) continue;
    ensure({ area: "mind", kind: "geo", source_table: "countries", source_id: c.k, direction: m, deck: c.r, topic: c.s, payload: { mode: m, code: c.k, name: c.n, capital: c.c, region: c.r, subregion: c.s } });
  }
  if (want("puzzle")) for (const p of await store.list("chess_puzzles", { limit: 2000 }))
    ensure({ area: "mind", kind: "puzzle", source_table: "chess_puzzles", source_id: p.id, deck: "my games", payload: { fen: p.fen, solution: p.solution, note: p.note ?? null } });
  if (want("opening")) for (const d of await store.list("opening_drills", { limit: 2000 }))
    ensure({ area: "mind", kind: "opening", source_table: "openings", source_id: String(d.opening), deck: d.side ?? null, payload: { opening: d.opening, name: d.name, side: d.side } });
  if (want("note")) for (const nt of await store.list("notes", { limit: 3000 }).catch(() => [] as Row[])) {
    if (nt.deleted_at || !nt.review_at) continue;
    ensure({ area: "school", kind: "note", source_table: "notes", source_id: nt.id, deck: nt.subject ?? null, topic: nt.topic ?? null, spec_code: nt.spec_code ?? null, payload: { front: `Recall the key points of your note:\n\n**${nt.title}**${nt.topic ? ` (${nt.topic})` : ""}`, back: String(nt.body ?? "").replace(/!\[[^\]]*\]\(data:[^)]+\)/g, "[image]").slice(0, 2500) } });
  }
  if (want("palace")) for (const l of await store.list("palaces", { limit: 3000 }).catch(() => [] as Row[])) {
    if (!l.image) continue;
    ensure({ area: "mind", kind: "palace", source_table: "palaces", source_id: l.id, deck: l.palace, payload: { front: `**${l.palace}**, stop ${l.position ?? "?"}: *${l.locus}*\n\nWhat's stored here?`, back: l.image } });
  }
  if (want("poker") || want("coding")) for (const c of BUILTIN) {
    const kind = c.deck === "Poker" ? "poker" : "coding";
    if (want(kind)) ensure({ area: "mind", kind, source_table: "builtin", source_id: c.id, deck: c.deck, topic: c.topic, payload: { front: c.front, back: c.back } });
  }
  for (let i = 0; i < add.length; i += 200) for (const r of add.slice(i, i + 200)) await store.insert("sr_items", r).catch(() => null);
  return add.length;
}

/** Spec codes on upcoming tests -> their date (cap) and whether we're in the last 3 days (cram). */
async function examCaps(store: Store) {
  const tests = (await store.list("upcoming_tests", { limit: 200 }).catch(() => [] as Row[])).filter((t) => !t.deleted_at && t.status === "upcoming");
  const topics = await store.list("upcoming_test_topics", { limit: 3000 }).catch(() => [] as Row[]);
  const caps: { subject: string; code: string; date: string; cram: boolean }[] = [];
  for (const t of tests) for (const tp of topics.filter((x) => x.test_id === t.id)) for (const code of tp.spec_codes ?? []) {
    const date = `${String(t.date).slice(0, 10)}T${t.start_time ?? "09:00"}:00Z`;
    caps.push({ subject: t.subject, code, date, cram: Date.parse(date) - Date.now() < 3 * 864e5 && Date.parse(date) > Date.now() });
  }
  return caps;
}
const capFor = (caps: Awaited<ReturnType<typeof examCaps>>, it: Row) => {
  if (!it.spec_code) return null;
  const hits = caps.filter((c) => (it.deck == null || c.subject === it.deck) && (it.spec_code === c.code || String(it.spec_code).startsWith(c.code)));
  return hits.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
};

/** Status: due today per area/kind/deck, new available, 7-day forecast, streak, leeches, retention. */
export async function srStatus(store: Store) {
  await syncItems(store);
  const st = await srSettings(store);
  const [items, reviews] = await Promise.all([store.list("sr_items", { limit: 20000 }), store.list("sr_reviews", { order: { col: "reviewed_at", asc: false }, limit: 20000 })]);
  const live = items.filter((i) => !i.suspended && !st.areas_off.includes(i.area));
  const end = dayEnd(new Date(), st.rollover_hour).getTime();
  const today = studyDay(new Date(), st.rollover_hour);
  const doneNewToday = new Map<string, number>();
  for (const r of reviews) if (studyDay(r.reviewed_at, st.rollover_hour) === today && r.item_before?.state === "new") doneNewToday.set(r.area, (doneNewToday.get(r.area) ?? 0) + 1);
  const due = live.filter((i) => i.state !== "new" && i.due_at && Date.parse(i.due_at) < end);
  const counts: Record<string, { due: number; learning: number; new: number; kinds: Record<string, number>; decks: Record<string, number> }> = {};
  for (const a of ["school", "mind", "languages"]) counts[a] = { due: 0, learning: 0, new: 0, kinds: {}, decks: {} };
  for (const i of due) { const c = counts[i.area] ??= { due: 0, learning: 0, new: 0, kinds: {}, decks: {} }; c.due++; if (i.state !== "review") c.learning++; c.kinds[i.kind] = (c.kinds[i.kind] ?? 0) + 1; if (i.deck) c.decks[`${i.kind}:${i.deck}`] = (c.decks[`${i.kind}:${i.deck}`] ?? 0) + 1; }
  for (const [a, c] of Object.entries(counts)) {
    const newHere = live.filter((i) => i.area === a && i.state === "new" && !(i.due_at && Date.parse(i.due_at) > end));
    c.new = Math.max(0, Math.min(newHere.length, st.new_per_day - (doneNewToday.get(a) ?? 0)));
    for (const i of newHere) c.kinds[`${i.kind} (new)`] = (c.kinds[`${i.kind} (new)`] ?? 0) + 1;
  }
  const forecast = Array.from({ length: 7 }, (_, d) => {
    const from = d === 0 ? 0 : end + (d - 1) * 864e5, to = end + d * 864e5;
    return { day: studyDay(new Date(Math.max(Date.now(), from) + 1), st.rollover_hour), due: live.filter((i) => i.state !== "new" && i.due_at && Date.parse(i.due_at) >= from && Date.parse(i.due_at) < to).length };
  });
  const days = new Set(reviews.map((r) => studyDay(r.reviewed_at, st.rollover_hour)));
  let streak = 0; const d0 = new Date(); if (!days.has(today)) d0.setDate(d0.getDate() - 1);
  for (const d = d0; days.has(studyDay(d, st.rollover_hour)) && streak < 2000; d.setDate(d.getDate() - 1)) streak++;
  const r30 = reviews.filter((r) => Date.now() - Date.parse(r.reviewed_at) < 30 * 864e5 && r.item_before?.state === "review");
  return {
    counts, forecast, streak, reviews_today: reviews.filter((r) => studyDay(r.reviewed_at, st.rollover_hour) === today).length,
    retention_30d: r30.length ? Math.round((r30.filter((r) => r.rating > 1).length / r30.length) * 1000) / 10 : null,
    leeches: live.filter((i) => i.leech).slice(0, 30).map((i) => ({ id: i.id, kind: i.kind, deck: i.deck, lapses: i.lapses, front: String(i.payload?.front ?? i.payload?.name ?? "").slice(0, 120) })),
    totals: { items: live.length, known: live.filter((i) => i.state === "review").length, mastered: live.filter((i) => i.state === "review" && Number(i.stability ?? 0) >= 21).length },
    settings: st,
  };
}

/** A review queue: learning first, then due reviews (exam-boosted), then new up to today's cap. */
export async function srQueue(store: Store, f: { area?: string; kind?: string; deck?: string; direction?: string; limit?: number; region?: string; weak?: boolean; ids?: string[] }) {
  await syncItems(store, f.kind ? [f.kind] : undefined);
  if (f.weak || f.ids?.length) {
    // a targeted session (e.g. "my weak countries"): these items whether due or not, weakest first
    const pool = (await store.list("sr_items", { limit: 20000 })).filter((i) => !i.suspended && (!f.kind || i.kind === f.kind) && (!f.area || f.area === "all" || i.area === f.area) && (!f.direction || i.direction === f.direction) && (!f.region || f.region === "All" || i.payload?.region === f.region));
    const pick = f.ids?.length ? pool.filter((i) => f.ids!.includes(i.id)) : pool.filter((i) => weakness(i) > 0).sort((a, b) => weakness(b) - weakness(a));
    return { items: pick.slice(0, f.limit ?? 25).map((i) => ({ ...i, exam: null })), total_due: pick.length, new_available: 0, now: Date.now() };
  }
  const st = await srSettings(store);
  const caps = await examCaps(store);
  const items = (await store.list("sr_items", { limit: 20000 })).filter((i) => !i.suspended && !st.areas_off.includes(i.area)
    && (!f.area || f.area === "all" || i.area === f.area) && (!f.kind || i.kind === f.kind) && (!f.deck || i.deck === f.deck) && (!f.direction || i.direction === f.direction)
    && (!f.region || f.region === "All" || i.payload?.region === f.region));
  const end = dayEnd(new Date(), st.rollover_hour).getTime(), now = Date.now();
  const cram = (i: Row) => !!capFor(caps, i)?.cram;
  const learning = items.filter((i) => (i.state === "learning" || i.state === "relearning") && i.due_at && Date.parse(i.due_at) < end).sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
  const review = items.filter((i) => i.state === "review" && ((i.due_at && Date.parse(i.due_at) < end) || cram(i))).sort((a, b) => Number(!!capFor(caps, b)) - Number(!!capFor(caps, a)) || Date.parse(a.due_at) - Date.parse(b.due_at));
  const reviewsDoneToday = (await store.list("sr_reviews", { order: { col: "reviewed_at", asc: false }, limit: 5000 })).filter((r) => studyDay(r.reviewed_at, st.rollover_hour) === studyDay(new Date(), st.rollover_hour));
  const newDone = reviewsDoneToday.filter((r) => r.item_before?.state === "new" && (!f.area || f.area === "all" || r.area === f.area)).length;
  const fresh = items.filter((i) => i.state === "new" && !(i.due_at && Date.parse(i.due_at) > end))
    .sort((a, b) => Number(!!capFor(caps, b)) - Number(!!capFor(caps, a)) || (a.due_at && b.due_at ? Date.parse(a.due_at) - Date.parse(b.due_at) : a.due_at ? -1 : b.due_at ? 1 : 0) || String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, st.new_per_day - newDone));
  const budget = Math.max(0, st.max_reviews_per_day - reviewsDoneToday.length);
  // mixed: interleave kinds so areas alternate
  let all = [...learning, ...review.slice(0, budget), ...fresh];
  if (!f.kind && (f.area === "all" || !f.area)) {
    const byKind = new Map<string, Row[]>(); for (const i of all) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);
    const out: Row[] = []; while ([...byKind.values()].some((v) => v.length)) for (const v of byKind.values()) if (v.length) out.push(v.shift()!);
    all = out;
  }
  // per kind, then per area, then the default; 0 = unlimited (the whole queue)
  const limit = f.limit ?? (f.kind ? st.session_length[f.kind] : undefined) ?? (f.area ? st.session_length[f.area] : undefined) ?? st.session_length.default;
  return { items: all.slice(0, limit || all.length).map((i) => ({ ...i, exam: capFor(caps, i) })), total_due: learning.length + review.length, new_available: fresh.length, now };
}

/** How weak an item is: lapses, recent misses, and short stability for something already seen. */
export const weakness = (i: Row) => {
  const h = Array.isArray(i.history) ? i.history.slice(-5) : [];
  const recentMiss = h.filter((x: { rating: number }) => x.rating === 1).length;
  return Number(i.lapses ?? 0) * 2 + recentMiss * 3 + (i.state === "relearning" ? 3 : 0) + (i.state === "review" && Number(i.stability ?? 0) < 3 ? 1 : 0);
};

/** Geography mastery per country (all three modes) + the weakest countries. */
export async function srGeo(store: Store) {
  const items = (await store.list("sr_items", { eq: { kind: "geo" }, limit: 2000 }));
  const by = new Map<string, Row[]>(); for (const i of items) by.set(i.source_id, [...(by.get(i.source_id) ?? []), i]);
  const level = (r?: Row) => !r || r.state === "new" ? 0 : r.state !== "review" ? 1 : Number(r.stability ?? 0) >= 21 ? 3 : 2; // new, learning, known, mastered
  const countries = ALL.map((c) => {
    const rows = by.get(c.k) ?? [];
    const modes = Object.fromEntries(GEO_MODES.map((m) => [m, level(rows.find((r) => r.direction === m))]));
    const seen = rows.filter((r) => r.state !== "new");
    return { code: c.k, name: c.n, region: c.r, subregion: c.s, modes, level: seen.length ? Math.min(...seen.map(level)) : 0, weak: rows.reduce((a, r) => a + weakness(r), 0), lapses: rows.reduce((a, r) => a + Number(r.lapses ?? 0), 0), ids: rows.filter((r) => weakness(r) > 0).map((r) => r.id) };
  });
  const weakest = countries.filter((c) => c.weak > 0).sort((a, b) => b.weak - a.weak).slice(0, 25);
  return { countries, weakest };
}

/** Interval distribution (review items) and the real retention curve: % recalled by days since last review. */
export async function srCharts(store: Store, kind?: string) {
  const [items, reviews] = await Promise.all([store.list("sr_items", { limit: 20000 }), store.list("sr_reviews", { order: { col: "reviewed_at", asc: false }, limit: 20000 })]);
  const B = [[0, 1, "<1d"], [1, 3, "1-3d"], [3, 7, "3-7d"], [7, 14, "1-2w"], [14, 30, "2-4w"], [30, 90, "1-3m"], [90, 1e9, "3m+"]] as const;
  const rev = items.filter((i) => i.state === "review" && !i.suspended && (!kind || i.kind === kind));
  const intervals = B.map(([a, b, label]) => ({ label, n: rev.filter((i) => { const iv = i.due_at && i.last_reviewed_at ? (Date.parse(i.due_at) - Date.parse(i.last_reviewed_at)) / 864e5 : Number(i.stability ?? 0); return iv >= a && iv < b; }).length }));
  const rs = reviews.filter((r) => r.item_before?.state === "review" && r.item_before?.last_reviewed_at && (!kind || r.kind === kind));
  const retention = B.map(([a, b, label]) => {
    const inB = rs.filter((r) => { const d = (Date.parse(r.reviewed_at) - Date.parse(r.item_before.last_reviewed_at)) / 864e5; return d >= a && d < b; });
    return { label, n: inB.length, pct: inB.length ? Math.round((inB.filter((r) => r.rating > 1).length / inB.length) * 1000) / 10 : null };
  });
  const st = await srSettings(store);
  return { intervals, retention, target: Math.round(st.retention * 100), reviews_counted: rs.length, items_in_review: rev.length };
}

/** Record one answer: schedule, review row, and side effects in the source tables. */
export async function srReview(store: Store, b: { item_id: string; rating?: number; correct?: boolean; response_ms?: number; session_id?: string | null; mode?: string; answer?: string; confused_with?: string | null; practice?: boolean }) {
  const st = await srSettings(store);
  const it = await store.get("sr_items", b.item_id);
  if (!it) throw new Error("item not found");
  if (b.practice && !st.count_free_practice) return { practice: true };
  const rating = b.rating ?? autoRating(!!b.correct, b.response_ms, it.kind, st);
  const caps = await examCaps(store);
  const cap = capFor(caps, it)?.date ?? null;
  const before = card(it);
  const next = schedule(before, rating, new Date(), st, { cap, seed: it.id });
  const ivBefore = it.stability ?? null;
  const history = [...(Array.isArray(it.history) ? it.history : []), { at: nowIso(), rating, iv: Math.round(next.interval_days * 100) / 100 }].slice(-50);
  await store.update("sr_items", it.id, { state: next.state, stability: next.stability, difficulty: next.difficulty, due_at: next.due_at, last_reviewed_at: next.last_reviewed_at, reps: next.reps, lapses: next.lapses, step: next.step, leech: next.leech, history, updated_at: nowIso() });
  const rv = await store.insert("sr_reviews", { item_id: it.id, area: it.area, kind: it.kind, rating, correct: b.correct ?? rating > 1, response_ms: b.response_ms ?? null, session_id: b.session_id ?? null, interval_before: ivBefore, interval_after: next.interval_days, mode: b.mode ?? null, answer: b.answer ?? null, item_before: { ...before, history: it.history, leech: it.leech } });
  if (b.session_id) { const s = await store.get("sr_sessions", b.session_id); if (s) await store.update("sr_sessions", s.id, { answered_count: Number(s.answered_count ?? 0) + 1, correct_count: Number(s.correct_count ?? 0) + (rating > 1 ? 1 : 0), updated_at: nowIso() }); }
  // side effects
  if (it.kind === "flashcard" && !it.direction) await store.update("flashcards", it.source_id, { due_at: next.due_at, interval_days: Math.round(next.interval_days * 10) / 10, reps: next.reps, lapses: next.lapses, last_grade: rating, updated_at: nowIso() }).catch(() => null);
  if (it.kind === "flashcard") await store.insert("reviews", { card_id: it.source_id, deck: it.deck, grade: rating, interval_days: Math.round(next.interval_days * 10) / 10 }).catch(() => null);
  if (it.kind === "mistake") {
    // a mistake is resolved after it's answered right twice in a row
    const last2 = [...history].slice(-2);
    if (last2.length === 2 && last2.every((h) => h.rating > 1)) await store.update("mistakes", it.source_id, { resolved: true, updated_at: nowIso() }).catch(() => null);
  }
  if (it.kind === "geo") {
    const p = it.payload ?? {};
    await store.insert("geo_attempts", { kind: p.mode, item: p.name, answer: b.answer ?? null, correct: rating > 1, region: p.region, subregion: p.subregion, seconds: b.response_ms ? Math.round(b.response_ms / 100) / 10 : null }).catch(() => null);
    // confusable neighbour: the country he answered instead comes back sooner
    if (b.confused_with && rating === 1) {
      const other = (await store.list("sr_items", { eq: { kind: "geo", direction: p.mode }, limit: 1000 })).find((x) => x.payload?.name === b.confused_with || x.payload?.capital === b.confused_with);
      if (other && other.state === "review" && other.due_at && Date.parse(other.due_at) > Date.now() + 864e5) await store.update("sr_items", other.id, { due_at: new Date(Date.now() + 864e5).toISOString() });
    }
  }
  if (it.spec_code && it.deck) {
    // spec confidence follows performance: 3 good in a row -> +1, a lapse -> -1
    const p = (await store.list("spec_points", { eq: { subject: it.deck, code: it.spec_code }, limit: 1 }).catch(() => [] as Row[]))[0];
    if (p) {
      const last3 = history.slice(-3);
      const c = Number(p.confidence ?? 3);
      if (rating === 1 && c > 1) await store.update("spec_points", p.id, { confidence: c - 1, last_reviewed_at: nowIso() });
      else if (last3.length === 3 && last3.every((h) => h.rating >= 3) && c < 5) await store.update("spec_points", p.id, { confidence: c + 1, last_reviewed_at: nowIso() });
    }
  }
  return { review_id: rv.id, rating, state: next.state, due_at: next.due_at, interval_days: next.interval_days, leech: next.leech, again_in_session: next.interval_days < 0.05 };
}

/** Undo the last answer: restore the item exactly as it was. */
export async function srUndo(store: Store, reviewId: string) {
  const rv = await store.get("sr_reviews", reviewId);
  if (!rv) throw new Error("nothing to undo");
  const b = rv.item_before ?? {};
  await store.update("sr_items", rv.item_id, { state: b.state, stability: b.stability, difficulty: b.difficulty, due_at: b.due_at, last_reviewed_at: b.last_reviewed_at, reps: b.reps, lapses: b.lapses, step: b.step, history: b.history ?? [], leech: !!b.leech });
  if (rv.session_id) { const s = await store.get("sr_sessions", rv.session_id); if (s) await store.update("sr_sessions", s.id, { answered_count: Math.max(0, Number(s.answered_count) - 1), correct_count: Math.max(0, Number(s.correct_count) - (rv.rating > 1 ? 1 : 0)) }); }
  await store.remove("sr_reviews", rv.id);
  return { ok: true, item_id: rv.item_id };
}
export { AREA_OF as areas };

/** Daily: a morning nudge with the due count (moved out of lesson time), plus a pile-up warning over 50. */
export async function srNudge(store: Store) {
  const st = await srSettings(store);
  const status = await srStatus(store);
  const due = Object.values(status.counts).reduce((a, c) => a + c.due, 0);
  const { dowOf, ukTime } = await import("./tests");
  const date = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  let at = ukTime(date, st.nudge_time || "07:30");
  // never during a lesson: if the time falls inside one, send it when that lesson ends
  const lessons = (await store.list("timetable", { limit: 500 }).catch(() => [] as Row[])).filter((t) => Number(t.day) === dowOf(date));
  for (const l of lessons) { const s = ukTime(date, l.start), e = ukTime(date, l.end); if (at >= s && at < e) at = e; }
  let n = 0;
  const id = `srnudge:${date}`;
  if (due && !(await store.list("inbox_items", { eq: { external_id: id }, limit: 1 })).length && at.getTime() > Date.now() - 3600e3) {
    await store.insert("inbox_items", { external_id: id, source: "Apollo reminder", title: `${due} item${due === 1 ? "" : "s"} due for review`, body: Object.entries(status.counts).filter(([, c]) => c.due).map(([a, c]) => `${a}: ${c.due}`).join(" · ") + ". Start all due on the Review page.", link: "/s/review", deliver_at: at.toISOString(), read_at: null, deleted_at: null }).catch(() => null);
    n++;
  }
  if (due > 50 && !(await store.list("inbox_items", { eq: { external_id: `srpile:${date}` }, limit: 1 })).length) {
    await store.insert("inbox_items", { external_id: `srpile:${date}`, source: "Apollo reminder", title: `Reviews are piling up: ${due} due`, body: "A 15-minute mixed session clears the oldest first. You can end it any time.", link: "/s/review", deliver_at: new Date(Math.max(Date.now(), at.getTime())).toISOString(), read_at: null, deleted_at: null }).catch(() => null);
    n++;
  }
  // brain tests: a nudge to retest anything not played for 14+ days (at most once a week)
  const brain = await store.list("brain_test_results", { order: { col: "created_at", asc: false }, limit: 2000 }).catch(() => [] as Row[]);
  const lastBy = new Map<string, Row>(); for (const r of brain) if (!lastBy.has(r.test)) lastBy.set(r.test, r);
  const stale = [...lastBy.values()].filter((r) => Date.now() - Date.parse(r.created_at) > 14 * 864e5);
  const wk = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
  if (stale.length && !(await store.list("inbox_items", { eq: { external_id: `brainretest:${wk}` }, limit: 1 })).length) {
    const best = (t: string) => { const v = brain.filter((r) => r.test === t).map((r) => Number(r.score)); return t === "reaction" ? Math.min(...v) : Math.max(...v); };
    await store.insert("inbox_items", { external_id: `brainretest:${wk}`, source: "Apollo reminder", title: `Retest: ${stale.map((r) => r.test).join(", ")}`, body: stale.map((r) => `${r.test}: last ${Math.floor((Date.now() - Date.parse(r.created_at)) / 864e5)} days ago, best ${best(r.test)} ${r.unit ?? ""}`).join(" · ") + ". A retest every couple of weeks shows the trend.", link: "/s/mind/brain", deliver_at: new Date(Math.max(Date.now(), at.getTime())).toISOString(), read_at: null, deleted_at: null }).catch(() => null);
    n++;
  }
  return n;
}
