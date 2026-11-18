import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";

/** PC focus tracking for one session, only when Reg turns it on: start {minutes, allow[], plan_item_id?} | stop {id} | get {id}. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (b.action === "start") { const j = await s.insert("jobs", { kind: "focus_track", status: "queued", ui_actions: [], output: { step: "Starting" }, input: { minutes: Number(b.minutes ?? 45), allow: Array.isArray(b.allow) ? b.allow.slice(0, 20) : [], plan_item_id: b.plan_item_id ?? null } }); return Response.json({ id: j.id }); }
  if (b.action === "stop") { const j = await s.get("jobs", b.id); if (j && ["queued", "running"].includes(j.status)) await s.update("jobs", b.id, { status: "cancelled", finished_at: nowIso() }); return Response.json({ ok: true, output: j?.output ?? null }); }
  if (b.action === "get") { const j = await s.get("jobs", b.id); return Response.json({ status: j?.status, output: j?.output ?? null }); }
  return Response.json({ error: "unknown action" }, { status: 400 });
}
