// Runs a spec binding against the store. All aggregation happens here, in code; the AI never
// supplies numbers. Missing data comes back empty so the UI can say "no data".
import type { Bind } from "../ui/spec";
import type { Row, Store } from "./store";

/** Tables generated UI may read (journal entries only when marked shareable). */
export const BINDABLE = new Set([
  "questions", "tests", "question_attempts", "screentime_apps", "habits", "habit_logs", "workout_plans", "school_tests", "mistakes", "water_logs", "goals", "body_metrics",
  "inbox_items", "conversations", "usage_log", "action_log", "files", "pages", "profile_facts",
  "projects", "project_notes", "project_links",
  "exercises", "workouts", "sets", "routines",
  "meals", "recipes", "sleep_logs", "screentime_days",
  "study_sessions", "flashcards", "reviews", "homework", "assignments", "quiz_results", "opportunities",
  "books", "reading_logs", "journal_entries", "weekly_reports",
  "chess_games", "chess_ratings", "poker_sessions", "brain_test_results", "memory_sessions", "coding_stats",
  "vocab_items", "vocab_reviews",
  "subjects", "spec_topics", "resource_links", "sources", "geo_attempts", "chess_evals",
  "timetable", "events", "notes", "recovery_logs", "palaces", "poker_hands",
  "plan_items", "past_papers", "past_paper_topics", "checkins", "opening_drills", "puzzle_attempts", "chess_puzzles",
  "chess_practice", "poker_practice",
]);
const SOFT = new Set(["inbox_items", "files", "pages", "projects", "project_notes", "workouts", "meals", "recipes", "conversations", "books", "journal_entries", "flashcards", "homework", "opportunities", "notes", "events"]);

export type Series = { label: string; value: number }[];
export type QueryResult = { rows?: Row[]; value?: number | null; series?: Series; error?: string };

const dayKey = (iso: string) => iso.slice(0, 10);
const weekKey = (iso: string) => {
  const d = new Date(iso.slice(0, 10));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

function reduce(fn: string, vals: number[]): number | null {
  if (fn === "count") return vals.length;
  if (!vals.length) return null;
  if (fn === "sum") return vals.reduce((a, b) => a + b, 0);
  if (fn === "avg") return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  if (fn === "pct") return Math.round((vals.filter((v) => v > 0).length / vals.length) * 1000) / 10;
  if (fn === "per100") return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100 * 10) / 10;
  if (fn === "max") return Math.max(...vals);
  if (fn === "min") return Math.min(...vals);
  return vals[vals.length - 1];
}

export async function runBind(store: Store, b: Bind, opts: { owner?: boolean } = {}): Promise<QueryResult> {
  if (!BINDABLE.has(b.table)) return { error: `table ${b.table} is not readable` };
  const dateField = b.dateField ?? "created_at";
  let rows = await store.list(b.table, {
    eq: b.where as Record<string, string | number | boolean | null> | undefined,
    isNull: SOFT.has(b.table) ? ["deleted_at"] : undefined,
    order: b.order ?? { col: dateField, asc: !!b.agg },
    limit: b.agg ? 5000 : (b.limit ?? 50),
  });
  // Date-only values ("2026-11-12") compare by calendar day; timestamps by instant.
  const today = new Date().toISOString().slice(0, 10);
  if (b.due) {
    const now = new Date().toISOString(), f = b.due.field;
    rows = rows.filter((r) => {
      if (r[f] == null) return !!b.due!.includeNull;
      const v = String(r[f]);
      return v.length === 10 ? v < today : v <= now; // a date-only item is overdue from the next day
    });
  }
  if (b.upcoming) {
    const now = Date.now(), f = b.upcoming.field;
    const start = new Date(now - 864e5 / 2).toISOString(), end = new Date(now + b.upcoming.days * 864e5).toISOString();
    const endDay = new Date(now + (b.upcoming.days - 1) * 864e5).toISOString().slice(0, 10);
    rows = rows.filter((r) => {
      if (r[f] == null) return false;
      const v = String(r[f]);
      return v.length === 10 ? v >= today && v <= endDay : v >= start && v <= end;
    }).sort((a, c) => String(a[f]).localeCompare(String(c[f])));
  }
  if (b.whereIn) for (const [k, vals] of Object.entries(b.whereIn)) rows = rows.filter((r) => vals.includes(r[k] ?? null));
  if (b.table === "journal_entries" && !opts.owner) rows = rows.filter((r) => r.shareable);
  if (b.days) {
    const since = new Date(Date.now() - b.days * 864e5).toISOString();
    rows = rows.filter((r) => String(r[dateField] ?? "") >= since.slice(0, String(r[dateField] ?? "").length || 10));
  }
  if (!b.agg) return { rows: rows.slice(0, b.limit ?? 50) };

  const { fn, field, by } = b.agg;
  const num = (r: Row) => (field ? (typeof r[field] === "boolean" ? (r[field] ? 1 : 0) : Number(r[field])) : 1);
  const valid = rows.filter((r) => fn === "count" || Number.isFinite(num(r)));
  if (!by) return { value: reduce(fn, valid.map(num)) };

  const groups = new Map<string, number[]>();
  if (by === "day" || by === "week") {
    // continuous axis, so gaps show as zero rather than vanishing
    const n = b.days ?? 14;
    for (let i = n - 1; i >= 0; i--) {
      const iso = new Date(Date.now() - i * 864e5).toISOString();
      const k = by === "day" ? dayKey(iso) : weekKey(iso);
      if (!groups.has(k)) groups.set(k, []);
    }
  }
  for (const r of valid) {
    const raw = String(r[by === "day" || by === "week" ? dateField : by.field] ?? "—");
    const k = by === "day" ? dayKey(raw) : by === "week" ? weekKey(raw) : raw;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(num(r));
  }
  // counts and sums: an empty day is a real 0. Averages, min/max, last: an empty day is a gap, not 0.
  const zeroOk = fn === "count" || fn === "sum";
  return { series: [...groups].filter(([, vals]) => zeroOk || vals.length).map(([label, vals]) => ({ label, value: reduce(fn, vals) ?? 0 })) };
}
