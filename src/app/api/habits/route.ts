import { storeOr503 } from "@/core/api";

/** POST {habit_id, habit, day}: tick the habit for that day, or untick it if already ticked. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.habit_id !== "string" || !/^\d{4}-\d\d-\d\d$/.test(String(b.day))) return Response.json({ error: "bad input" }, { status: 400 });
  const hit = (await s.list("habit_logs", { eq: { habit_id: b.habit_id }, limit: 2000 })).find((r) => String(r.day).slice(0, 10) === b.day);
  if (hit) { await s.remove("habit_logs", hit.id); return Response.json({ done: false }); }
  await s.insert("habit_logs", { habit_id: b.habit_id, habit: b.habit ?? null, day: b.day });
  return Response.json({ done: true });
}
