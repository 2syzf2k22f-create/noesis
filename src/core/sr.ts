// Spaced repetition engine (FSRS-4.5), shared by every review on NOESIS. Pure functions: no I/O.
//  - ratings: 1 Again, 2 Hard, 3 Good, 4 Easy (auto-graded items map correctness + response time to these)
//  - new and failed items go through short learning steps in the same session before day intervals
//  - intervals target a retention (default 90%), get fuzz, can be capped before an exam date
//  - the "day" rolls over at 04:00 UK time
export type State = "new" | "learning" | "review" | "relearning";
export type Card = { state: State; stability: number | null; difficulty: number | null; due_at: string | null; last_reviewed_at: string | null; reps: number; lapses: number; step: number };
export type SrSettings = { retention: number; learning_steps: number[]; relearning_steps: number[]; max_interval: number; new_per_day: number; max_reviews_per_day: number; leech_lapses: number; rollover_hour: number; fast_ms: Record<string, number>; slow_ms: Record<string, number>; confirm_end: boolean; esc_ends: boolean; count_free_practice: boolean; session_length: Record<string, number>; nudge_time: string; areas_off: string[] };
export const DEFAULT_SR: SrSettings = {
  retention: 0.9, learning_steps: [1, 10], relearning_steps: [10], max_interval: 365, new_per_day: 20, max_reviews_per_day: 200, leech_lapses: 8, rollover_hour: 4,
  fast_ms: { geo: 4000, puzzle: 15000, default: 5000 }, slow_ms: { geo: 12000, puzzle: 60000, default: 20000 },
  confirm_end: true, esc_ends: true, count_free_practice: false, session_length: { default: 20, geo: 32 }, nudge_time: "07:30", areas_off: [],
};
const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5, FACTOR = 19 / 81;
const clampD = (d: number) => Math.min(10, Math.max(1, d));
export const retrievability = (elapsedDays: number, s: number) => Math.pow(1 + (FACTOR * elapsedDays) / s, DECAY);
export const intervalFor = (s: number, retention: number) => (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
const initS = (g: number) => W[g - 1];
const initD = (g: number) => clampD(W[4] - (g - 3) * W[5]);
const nextD = (d: number, g: number) => clampD(W[7] * initD(3) + (1 - W[7]) * (d - W[6] * (g - 3)));
const recallS = (d: number, s: number, r: number, g: number) => s * (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
const forgetS = (d: number, s: number, r: number) => W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));

/** Correctness + speed -> rating, for auto-graded items. */
export function autoRating(correct: boolean, ms: number | null | undefined, kind: string, st: SrSettings = DEFAULT_SR) {
  if (!correct) return 1;
  const fast = st.fast_ms[kind] ?? st.fast_ms.default, slow = st.slow_ms[kind] ?? st.slow_ms.default;
  if (ms == null) return 3;
  return ms <= fast ? 4 : ms >= slow ? 2 : 3;
}
/** Deterministic fuzz (±5%, at least ±1 day past 3 days) so items don't clump. */
function fuzz(days: number, seed: string) {
  if (days < 2.5) return days;
  let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  const f = ((Math.abs(h) % 1000) / 1000) * 2 - 1;
  const spread = Math.max(1, days * 0.05);
  return Math.max(1, days + f * spread);
}

export type Scheduled = Card & { interval_days: number; leech: boolean };
/** Apply a rating. `cap` (ISO) keeps the next due before an exam. */
export function schedule(c: Card, rating: number, now = new Date(), st: SrSettings = DEFAULT_SR, opts: { cap?: string | null; seed?: string } = {}): Scheduled {
  const g = Math.min(4, Math.max(1, Math.round(rating)));
  const elapsed = c.last_reviewed_at ? Math.max(0, (now.getTime() - Date.parse(c.last_reviewed_at)) / 864e5) : 0;
  let { state, stability: s, difficulty: d, step, lapses } = c;
  let minutes: number | null = null, days: number | null = null;
  if (state === "new" || s == null || d == null) {
    s = initS(g); d = initD(g);
    if (g === 4) { state = "review"; days = intervalFor(s, st.retention); }
    else { state = "learning"; step = g === 3 ? 1 : 0; minutes = g === 2 ? st.learning_steps[0] * 1.5 : st.learning_steps[Math.min(step, st.learning_steps.length - 1)]; }
  } else if (state === "learning" || state === "relearning") {
    const steps = state === "learning" ? st.learning_steps : st.relearning_steps;
    if (g === 1) { step = 0; minutes = steps[0]; }
    else if (g === 2) { minutes = steps[Math.min(step, steps.length - 1)] * 1.5; }
    else if (g === 3 && step + 1 < steps.length) { step += 1; minutes = steps[step]; }
    else { state = "review"; step = 0; s = g === 4 ? Math.max(s, initS(4)) : s; days = intervalFor(s, st.retention); }
    d = nextD(d, g);
  } else {
    const r = retrievability(elapsed, s);
    d = nextD(d, g);
    if (g === 1) { s = forgetS(d, s, r); lapses += 1; state = "relearning"; step = 0; minutes = st.relearning_steps[0]; }
    else { s = recallS(d, s, r, g); days = intervalFor(s, st.retention); }
  }
  let due: Date;
  if (minutes != null) due = new Date(now.getTime() + minutes * 60e3);
  else {
    let iv = Math.min(st.max_interval, Math.max(1, fuzz(days!, `${opts.seed ?? ""}${c.reps}`)));
    if (opts.cap) { const left = (Date.parse(opts.cap) - now.getTime()) / 864e5 - 1; if (left >= 0.5) iv = Math.min(iv, left); else iv = Math.min(iv, 0.5); }
    due = new Date(now.getTime() + iv * 864e5);
  }
  return { state, stability: s, difficulty: d, due_at: due.toISOString(), last_reviewed_at: now.toISOString(), reps: c.reps + 1, lapses, step, interval_days: (due.getTime() - now.getTime()) / 864e5, leech: lapses >= st.leech_lapses };
}

/** End of the current study "day" (next 04:00 UK) — anything due before it counts as due today. */
export function dayEnd(now = new Date(), hour = 4) {
  const uk = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const offset = uk.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const end = new Date(uk); end.setHours(hour, 0, 0, 0);
  if (uk.getHours() >= hour) end.setDate(end.getDate() + 1);
  return new Date(end.getTime() - offset);
}
/** The study day an instant belongs to (YYYY-MM-DD, rolling over at 04:00 UK). */
export const studyDay = (iso: string | Date, hour = 4) => new Date(new Date(iso).getTime() - hour * 3600e3).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
