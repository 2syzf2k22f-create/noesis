// School > Spec: specification statements with Reg's confidence, and how much evidence (flashcards,
// questions, attempts, tests, mistakes, study time) each one has. Shared by the page, the API and Apollo.
import type { Row, Store } from "./store";

export const SPEC_SUBJECTS = ["Maths", "Further Maths", "Physics", "Economics"] as const;
export type Evidence = { cards: number; questions: number; attempts: number; attempt_pct: number | null; tests: number; mistakes: number; minutes: number; notes: number; resources: number };
const EMPTY: Evidence = { cards: 0, questions: 0, attempts: 0, attempt_pct: null, tests: 0, mistakes: 0, minutes: 0, notes: 0, resources: 0 };

/** Does `code` belong under statement `stmt`? ("1.02a" covers itself; a link to "3.1" counts for 3.1.x.) */
const covers = (linked: string, code: string) => linked === code || code.startsWith(`${linked}.`) || (linked.length > 1 && code.startsWith(linked) && /^[a-z]$/.test(code.slice(linked.length)));

export async function specWithEvidence(store: Store, subject?: string) {
  const all = (await store.list("spec_points", { ...(subject ? { eq: { subject } } : {}), limit: 10000 }).catch(() => [] as Row[])).filter((r) => !r.deleted_at);
  const tables = ["flashcards", "questions", "question_attempts", "school_tests", "mistakes", "study_sessions", "notes", "resource_links"] as const;
  const linked = await Promise.all(tables.map((t) => store.list(t, { limit: 10000 }).catch(() => [] as Row[]).then((rs) => rs.filter((r) => r.spec_code && !r.deleted_at))));
  const ev = new Map<string, Evidence>();
  const key = (s: string, c: string) => `${s}|${c}`;
  for (const p of all) ev.set(key(p.subject, p.code), { ...EMPTY });
  // flashcards carry their subject in "deck"; everything else has "subject"
  const subj = (r: Row) => r.subject ?? r.deck;
  const add = (r: Row, f: (e: Evidence) => void) => {
    for (const p of all) if (p.subject === subj(r) && covers(String(r.spec_code), p.code)) f(ev.get(key(p.subject, p.code))!);
  };
  const [cards, qs, att, tests, mist, sess, notes, res] = linked;
  cards.forEach((r) => add(r, (e) => e.cards++));
  qs.forEach((r) => add(r, (e) => e.questions++));
  att.forEach((r) => add(r, (e) => { e.attempt_pct = e.attempt_pct == null ? Number(r.pct ?? 0) : Math.round((e.attempt_pct * e.attempts + Number(r.pct ?? 0)) / (e.attempts + 1)); e.attempts++; }));
  tests.forEach((r) => add(r, (e) => e.tests++));
  mist.forEach((r) => add(r, (e) => { if (!r.resolved) e.mistakes++; }));
  sess.forEach((r) => add(r, (e) => { e.minutes += Number(r.minutes ?? 0); }));
  notes.forEach((r) => add(r, (e) => e.notes++));
  res.forEach((r) => add(r, (e) => e.resources++));
  return all.map((p) => ({ ...p, evidence: ev.get(key(p.subject, p.code))! }) as SpecRow);
}
export type SpecRow = Row & { evidence: Evidence };
export const hasEvidence = (e: Evidence) => e.cards + e.questions + e.attempts + e.tests > 0;

/** When a statement is next due for a confidence review: weaker = sooner (spaced review of the spec). */
export function reviewDue(p: Row) {
  const days = [1, 2, 4, 9, 21][Math.max(0, Math.min(4, Number(p.confidence ?? 1) - 1))];
  const last = p.last_reviewed_at ? Date.parse(p.last_reviewed_at) : 0;
  return last + days * 864e5;
}

/** Priority for revision: low confidence, no evidence, recent mistakes, poor attempts, not reviewed lately. */
export function priority(p: SpecRow) {
  const c = p.confidence == null ? 2.5 : Number(p.confidence);
  const e = p.evidence;
  return (5 - c) * 3 + (hasEvidence(e) ? 0 : 3) + Math.min(4, e.mistakes * 1.5) + (e.attempt_pct != null && e.attempt_pct < 60 ? 3 : 0) + (reviewDue(p) < Date.now() ? 1 : 0) + (p.optional && !p.chosen ? -100 : 0);
}

/** Compact per-subject summary for the school analysis and the planner. */
export async function specCoverage(store: Store) {
  const rows = await specWithEvidence(store);
  return SPEC_SUBJECTS.map((s) => {
    const st = rows.filter((r) => r.subject === s && r.level === 4 && !(r.optional && !r.chosen));
    const rated = st.filter((r) => r.confidence != null);
    return {
      subject: s, statements: st.length, verified: st.filter((r) => r.verified).length, rated: rated.length,
      avg_confidence: rated.length ? Math.round((rated.reduce((a, r) => a + Number(r.confidence), 0) / rated.length) * 10) / 10 : null,
      no_evidence: st.filter((r) => !hasEvidence(r.evidence)).length,
      top_priorities: [...st].sort((a, b) => priority(b) - priority(a)).slice(0, 8).map((r) => ({ code: r.code, title: r.title ?? String(r.text ?? "").slice(0, 80), confidence: r.confidence, evidence: r.evidence })),
    };
  });
}
