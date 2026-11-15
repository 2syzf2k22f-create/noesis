// Two-week timetables: which week (A or B) a date falls in. Week A starts on the anchor Monday
// (settings.data.week_a_anchor, default 2026-11-16) and the weeks alternate every Monday.
export const DEFAULT_WEEK_A_ANCHOR = "2026-11-16";
export type Wk = "A" | "B";

/** "Week A", "a", "A" -> "A"; anything else (blank, null) -> null = the lesson runs in both weeks. */
export function normWeek(w: unknown): Wk | null {
  const s = String(w ?? "").trim().toUpperCase().replace(/^WEEK\s*/, "");
  return s === "A" || s === "B" ? s : null;
}
/** Monday (UTC midnight) of the week containing `d`, in UK time. */
function mondayOf(d: Date) {
  const uk = new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const dow = (uk.getDay() + 6) % 7;
  return Date.UTC(uk.getFullYear(), uk.getMonth(), uk.getDate() - dow);
}
export function weekOf(d: Date, anchor = DEFAULT_WEEK_A_ANCHOR): Wk {
  const [y, m, day] = (/^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : DEFAULT_WEEK_A_ANCHOR).split("-").map(Number);
  const a = Date.UTC(y, m - 1, day);
  const aMon = a - ((new Date(a).getUTCDay() + 6) % 7) * 864e5;
  const weeks = Math.round((mondayOf(d) - aMon) / (7 * 864e5));
  return ((weeks % 2) + 2) % 2 === 0 ? "A" : "B";
}
/** Does this lesson run in week `wk`? (No week set = both weeks; wk null = show everything.) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const inWeek = (row: Record<string, any>, wk: Wk | null) => !wk || !normWeek(row.week) || normWeek(row.week) === wk;
export const anchorOf = (settingsData: Record<string, unknown> | null | undefined) =>
  typeof settingsData?.week_a_anchor === "string" ? (settingsData.week_a_anchor as string) : DEFAULT_WEEK_A_ANCHOR;
