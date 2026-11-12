// Habit streaks, computed in code from logs: current streak, best streak, last 14 days.
import type { Row, Store } from "./store";

const LANGS = new Set(["Mandarin", "Spanish", "French", "English"]);
export const HABITS: { id: string; label: string; table: string; filter?: (r: Row) => boolean }[] = [
  { id: "revision", label: "Revision", table: "study_sessions" },
  { id: "cards", label: "Flashcards", table: "reviews", filter: (r) => !LANGS.has(String(r.deck)) },
  { id: "languages", label: "Languages", table: "reviews", filter: (r) => LANGS.has(String(r.deck)) },
  { id: "training", label: "Training", table: "sets" },
  { id: "checkin", label: "Check-in", table: "checkins" },
  { id: "reading", label: "Reading", table: "reading_logs" },
  { id: "chess", label: "Chess puzzles", table: "puzzle_attempts" },
];

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function streaks(store: Store) {
  const since = new Date(Date.now() - 400 * 864e5).toISOString();
  return Promise.all(HABITS.map(async (h) => {
    const rows = (await store.list(h.table, { limit: 20000 }).catch(() => [] as Row[])).filter((r) => r.created_at >= since && !r.deleted_at && (!h.filter || h.filter(r)));
    const days = new Set(rows.map((r) => String(r.created_at).slice(0, 10)));
    let current = 0;
    for (let i = 0; ; i++) {
      const k = day(new Date(Date.now() - i * 864e5));
      if (days.has(k)) current++;
      else if (i === 0) continue; // today not done yet doesn't break the streak
      else break;
    }
    let best = 0, run = 0;
    for (let i = 400; i >= 0; i--) { if (days.has(day(new Date(Date.now() - i * 864e5)))) best = Math.max(best, ++run); else run = 0; }
    const last14 = Array.from({ length: 14 }, (_, i) => days.has(day(new Date(Date.now() - (13 - i) * 864e5))));
    return { id: h.id, label: h.label, current, best, today: days.has(day(new Date())), last14 };
  }));
}
