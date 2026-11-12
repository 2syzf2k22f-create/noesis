// Pure spaced-repetition maths (safe for the browser).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export type Grade = 0 | 1 | 2 | 3; // again, hard, good, easy
export const GRADES = ["Again", "Hard", "Good", "Easy"] as const;
const MIN = 60_000, DAY = 864e5;

export function schedule(card: Row, g: Grade, now = Date.now()) {
  let ease = Number(card.ease ?? 2.5), interval = Number(card.interval_days ?? 0), reps = Number(card.reps ?? 0), lapses = Number(card.lapses ?? 0);
  let due: number;
  if (g === 0) {
    reps = 0; lapses += 1; ease = Math.max(1.3, ease - 0.2); interval = 0; due = now + 10 * MIN;
  } else {
    if (g === 1) { interval = Math.max(1, interval * 1.2); ease = Math.max(1.3, ease - 0.15); }
    else if (reps === 0) interval = g === 3 ? 3 : 1;
    else if (reps === 1) interval = g === 3 ? 5 : 3;
    else interval = interval * ease * (g === 3 ? 1.3 : 1);
    if (g === 3) ease += 0.15;
    reps += 1;
    interval = Math.round(interval * 10) / 10;
    due = now + interval * DAY;
  }
  return { ease: Math.round(ease * 100) / 100, interval_days: interval, reps, lapses, last_grade: g, due_at: new Date(due).toISOString() };
}

export const previewLabel = (card: Row, g: Grade) => {
  const s = schedule(card, g);
  return g === 0 ? "10 min" : s.interval_days < 1.5 ? "1 day" : `${Math.round(s.interval_days)} days`;
};

