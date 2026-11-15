// Recurring reminders (workouts, study hours): rules -> at least 28 days of future inbox rows, delivered
// lead_minutes before each start (UK time, GMT/BST handled). One row per rule per date (external_id
// "rr:<rule>:<date>"), so running it again never duplicates. Editing/pausing a rule regenerates its rows.
import type { Row, Store } from "./store";
import { dowOf, ukTime } from "./tests";

const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

function rowFor(rule: Row, date: string) {
  const start = ukTime(date, rule.start), deliver = new Date(start.getTime() - Number(rule.lead_minutes ?? 30) * 60e3);
  const workout = rule.kind === "workout";
  return {
    external_id: `rr:${rule.id}:${date}`, source: "Apollo reminder",
    title: workout ? `Workout in ${rule.lead_minutes} min: ${rule.label}` : `${rule.label} in ${rule.lead_minutes} min`,
    body: workout ? `${rule.label} at ${rule.start}. Start it from Fitness › Routines.` : `${rule.label} at ${rule.start}${rule.end_time ? `–${rule.end_time}` : ""}. Start with 10 minutes of due reviews, then your weakest spec statements.`,
    link: rule.link ?? null, due_at: start.toISOString(), deliver_at: deliver.toISOString(), read_at: null, deleted_at: null,
  };
}

/** Make sure every active rule has its rows for the next `days` days. Returns how many were created. */
export async function ensureRecurring(store: Store, days = 28) {
  const rules = (await store.list("recurring_reminders", { limit: 200 }).catch(() => [] as Row[])).filter((r) => r.active);
  const existing = new Set((await store.list("inbox_items", { eq: { source: "Apollo reminder" }, limit: 5000 })).map((r) => r.external_id).filter(Boolean));
  let created = 0;
  for (let i = 0; i <= days; i++) {
    const date = ymd(new Date(Date.now() + i * 864e5));
    for (const rule of rules.filter((r) => Number(r.weekday) === dowOf(date))) {
      const row = rowFor(rule, date);
      if (existing.has(row.external_id) || Date.parse(row.deliver_at) <= Date.now()) continue;
      try { await store.insert("inbox_items", row); existing.add(row.external_id); created++; } catch { /* unique index: already there */ }
    }
  }
  return created;
}

/** After a rule changes (or is paused/deleted): drop its undelivered future rows, then rebuild. */
export async function regenerateRule(store: Store, ruleId: string) {
  for (const r of await store.list("inbox_items", { eq: { source: "Apollo reminder" }, limit: 5000 }))
    if (String(r.external_id ?? "").startsWith(`rr:${ruleId}:`) && !r.read_at && Date.parse(r.deliver_at) > Date.now()) await store.remove("inbox_items", r.id);
  return ensureRecurring(store);
}

/** Rules whose start is within the next `minutes` (for Apollo's first reply). */
export async function rulesStartingSoon(store: Store, minutes = 30) {
  const now = Date.now(), date = ymd(new Date());
  return (await store.list("recurring_reminders", { limit: 200 }).catch(() => [] as Row[])).filter((r) => r.active && Number(r.weekday) === dowOf(date)).filter((r) => {
    const s = ukTime(date, r.start).getTime();
    return s - now > 0 && s - now <= minutes * 60e3;
  });
}
