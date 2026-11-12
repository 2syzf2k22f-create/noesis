// Agenda: one sorted list of what's coming up, merged in code from homework, events,
// inbox items with due dates, opportunity deadlines and today's lessons.
import type { Row, Store } from "./store";

export type AgendaItem = { at: string; title: string; kind: string; sub?: string; href?: string; id?: string; table?: string };

export async function agenda(store: Store, days = 14): Promise<AgendaItem[]> {
  const now = Date.now(), from = new Date(now - 864e5).toISOString(), to = new Date(now + days * 864e5).toISOString();
  const pick = async (table: string, field: string) =>
    (await store.list(table, { limit: 2000 }).catch(() => [] as Row[])).filter((r) => !r.deleted_at && r[field] && String(r[field]) >= from && String(r[field]) <= to);
  const [hw, ev, inbox, opps] = await Promise.all([pick("homework", "due_at"), pick("events", "at"), pick("inbox_items", "due_at"), pick("opportunities", "deadline")]);
  const items: AgendaItem[] = [
    ...hw.filter((h) => h.status !== "done").map((h) => ({ at: h.due_at, title: h.title, kind: "homework", sub: h.subject, href: "/s/school/homework", id: h.id, table: "homework" })),
    ...ev.map((e) => ({ at: e.at, title: e.title, kind: e.kind ?? "event", sub: e.subject ?? e.location, href: "/s/school/timetable", id: e.id, table: "events" })),
    ...inbox.filter((i) => !i.read_at).map((i) => ({ at: i.due_at, title: i.title, kind: "inbox", sub: i.source, href: i.link ?? "/s/inbox" })),
    ...opps.map((o) => ({ at: o.deadline, title: o.title, kind: "deadline", sub: "opportunity", href: o.url })),
  ];
  return items.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
