// Weekly scores: transparent formulas over logged data. Each area: score = min(100, round(actual / target × 100)).
// No data in an area -> null ("no data"), never zero by assumption. Targets live in settings.data.targets.
import type { Store } from "./store";

export const DEFAULT_TARGETS = {
  revision_minutes: 600, // per week
  sets: 60, // per week
  sleep_hours: 8, // nightly average
  protein_g: 120, // daily average on logged days
  flashcard_reviews: 150, // per week
  reading_pages: 150, // per week
  chess_games: 10, // per week
  language_reviews: 100, // per week
};
export type Targets = typeof DEFAULT_TARGETS;

export type AreaScore = { area: string; score: number | null; actual: number | null; target: number; unit: string; formula: string };

const DAY = 864e5;
const sum = (rows: { [k: string]: unknown }[], f: string) => rows.reduce((a, r) => a + (Number(r[f]) || 0), 0);

/** Monday 00:00 (UTC) of the week containing `d`, offset by `weeksAgo`. */
export function weekStart(weeksAgo = 0, d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7) - weeksAgo * 7);
  return x;
}

export async function weeklyScores(store: Store, weeksAgo = 0) {
  const settings = await store.get("settings", "main").catch(() => null);
  const T: Targets = { ...DEFAULT_TARGETS, ...(settings?.data?.targets ?? {}) };
  const from = weekStart(weeksAgo), to = new Date(from.getTime() + 7 * DAY);
  const inWeek = async (table: string, extra?: (r: { [k: string]: unknown }) => boolean) => {
    const rows = await store.list(table, { order: { col: "created_at", asc: false }, limit: 5000 }).catch(() => []);
    return rows.filter((r) => !r.deleted_at && r.created_at >= from.toISOString() && r.created_at < to.toISOString() && (!extra || extra(r)));
  };
  const [study, sets, sleep, meals, reviews, reading, chess] = await Promise.all([
    inWeek("study_sessions"), inWeek("sets"), inWeek("sleep_logs"), inWeek("meals"), inWeek("reviews"), inWeek("reading_logs"), inWeek("chess_games"),
  ]);
  const langDecks = new Set(["Mandarin", "Spanish", "French", "English"]);
  const schoolReviews = reviews.filter((r) => !langDecks.has(String(r.deck)));
  const langReviews = reviews.filter((r) => langDecks.has(String(r.deck)));
  const mealDays = new Set(meals.map((m) => String(m.created_at).slice(0, 10))).size;

  const area = (a: string, actual: number | null, target: number, unit: string, formula: string): AreaScore => ({
    area: a, actual: actual == null ? null : Math.round(actual * 10) / 10, target, unit, formula,
    score: actual == null ? null : Math.min(100, Math.round((actual / target) * 100)),
  });
  const areas: AreaScore[] = [
    area("Revision", study.length ? sum(study, "minutes") : null, T.revision_minutes, "min", "minutes studied ÷ weekly target"),
    area("Flashcards", schoolReviews.length ? schoolReviews.length : null, T.flashcard_reviews, "reviews", "school card reviews ÷ weekly target"),
    area("Fitness", sets.length ? sets.length : null, T.sets, "sets", "sets logged ÷ weekly target"),
    area("Sleep", sleep.length ? sum(sleep, "hours") / sleep.length : null, T.sleep_hours, "h/night", "average hours ÷ target"),
    area("Nutrition", mealDays ? sum(meals, "protein_g") / mealDays : null, T.protein_g, "g protein/day", "average daily protein on logged days ÷ target"),
    area("Languages", langReviews.length ? langReviews.length : null, T.language_reviews, "reviews", "vocab reviews ÷ weekly target"),
    area("Reading", reading.length ? sum(reading, "pages") : null, T.reading_pages, "pages", "pages read ÷ weekly target"),
    area("Chess", chess.length ? chess.length : null, T.chess_games, "games", "games played ÷ weekly target"),
  ];
  const scored = areas.filter((a) => a.score != null);
  const overall = scored.length ? Math.round(scored.reduce((x, a) => x + a.score!, 0) / scored.length) : null;
  const grade = overall == null ? null : overall >= 90 ? "A*" : overall >= 80 ? "A" : overall >= 70 ? "B" : overall >= 60 ? "C" : overall >= 50 ? "D" : "E";
  return { week: from.toISOString().slice(0, 10), overall, grade, areas, targets: T };
}
