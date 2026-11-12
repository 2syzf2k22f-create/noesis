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
  return data;
}
