import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { testDetail } from "@/core/tests";

/** One test with its topics, spec statements, evidence, readiness, homework and revision sessions. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const d = await testDetail(s, id);
  if (!d) return Response.json({ error: "not found" }, { status: 404 });
  const [sessions, maps, plan, reminders, others] = await Promise.all([
    s.list("test_sessions", { eq: { test_id: id }, order: { col: "created_at", asc: false }, limit: 20 }).catch(() => []),
    s.list("chapter_maps", { eq: { subject: d.subject }, limit: 200 }).catch(() => []),
    s.list("plan_items", { eq: { test_id: id }, limit: 200 }).catch(() => []),
    s.list("inbox_items", { eq: { test_id: id }, limit: 50 }).catch(() => []),
    s.list("upcoming_tests", { eq: { subject: d.subject }, limit: 100 }).catch(() => []),
  ]);
  const history = others.filter((t) => !t.deleted_at && t.id !== id && t.status === "done").map((t) => ({ id: t.id, title: t.title, date: String(t.date).slice(0, 10), result_marks: t.result_marks, total_marks: t.total_marks, result_grade: t.result_grade })).sort((a, b) => b.date.localeCompare(a.date));
  return Response.json({ ...d, sessions, chapter_maps: maps, plan: plan.sort((a, b) => String(a.date).localeCompare(String(b.date))), reminders: reminders.map((r) => ({ id: r.id, title: r.title, deliver_at: r.deliver_at, read_at: r.read_at })).sort((a, b) => String(a.deliver_at).localeCompare(String(b.deliver_at))), history });
}
