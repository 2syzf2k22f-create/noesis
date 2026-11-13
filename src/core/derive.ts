// Derived fields computed in code on write (never by the AI).
export function derive(table: string, data: Record<string, unknown>) {
  if (table === "sets") {
    const w = Number(data.weight_kg), r = Number(data.reps);
    if (Number.isFinite(w) && Number.isFinite(r)) data.volume = Math.round(w * r * 10) / 10;
  }
  if (table === "poker_sessions") {
    const b = Number(data.buy_in), c = Number(data.cash_out);
    if (Number.isFinite(b) && Number.isFinite(c)) data.profit = Math.round((c - b) * 100) / 100;
  }
  if (table === "past_papers" || table === "past_paper_topics" || table === "question_attempts" || table === "school_tests") {
    const m = Number(table === "school_tests" ? data.score : data.marks), t = Number(data.total);
    if (Number.isFinite(m) && Number.isFinite(t) && t > 0) data.pct = Math.round((m / t) * 1000) / 10;
  }
  if (table === "timetable" && typeof data.day === "string") data.day = parseInt(data.day, 10) || 1;
  return data;
}
