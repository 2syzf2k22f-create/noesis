import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { ensureRecurring, regenerateRule } from "@/core/recurring";

/** Recurring reminder rules (Settings). */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const rules = await s.list("recurring_reminders", { limit: 200 });
  const rows = await s.list("inbox_items", { eq: { source: "Apollo reminder" }, limit: 5000 });
  return Response.json({ rules: rules.sort((a, b) => a.weekday - b.weekday || String(a.start).localeCompare(String(b.start))).map((r) => {
    const mine = rows.filter((x) => String(x.external_id ?? "").startsWith(`rr:${r.id}:`) && Date.parse(x.deliver_at) > Date.now());
    return { ...r, scheduled: mine.length, next: mine.map((x) => x.deliver_at).sort()[0] ?? null };
  }) });
}

/** POST {action: "save", rule} | {action: "delete", id} | {action: "ensure"} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (b.action === "ensure") return Response.json({ created: await ensureRecurring(s) });
  if (b.action === "delete") { await s.remove("recurring_reminders", b.id); await regenerateRule(s, b.id); return Response.json({ ok: true }); }
  if (b.action === "save") {
    const r = b.rule ?? {};
    if (!/^\d\d:\d\d$/.test(r.start ?? "") || !(r.weekday >= 1 && r.weekday <= 7)) return Response.json({ error: "Needs a weekday 1-7 and a start HH:MM." }, { status: 400 });
    const data = { kind: r.kind ?? "other", label: String(r.label ?? "Reminder").slice(0, 80), weekday: Number(r.weekday), start: r.start, end_time: r.end_time || null, lead_minutes: Math.max(0, Math.min(240, Number(r.lead_minutes ?? 30))), link: r.link || null, active: r.active !== false, updated_at: nowIso() };
    const row = r.id ? await s.update("recurring_reminders", r.id, data) : await s.insert("recurring_reminders", data);
    return Response.json({ id: row!.id, created: await regenerateRule(s, row!.id) });
  }
  return Response.json({ error: "bad action" }, { status: 400 });
}
