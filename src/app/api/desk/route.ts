import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { pushSettings, sendPush } from "@/core/push";

/** Phone notifications (ntfy), scheduled PC tasks and folder watches, for Settings. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const data = (await s.get("settings", "main").catch(() => null))?.data ?? {};
  return Response.json({ push: await pushSettings(s), schedules: await s.list("pc_schedules", { limit: 200 }).catch(() => []), folder_watches: data.folder_watches ?? [] });
}

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const st = await s.get("settings", "main");
  const data = st?.data ?? {};
  const save = (patch: object) => s.update("settings", "main", { data: { ...data, ...patch } });
  switch (b.action) {
    case "push_settings": await save({ ntfy_topic: b.topic || null, push_on: !!b.on, push_quiet: b.quiet || "22:30-07:00" }); return Response.json({ ok: true });
    case "push_test": return Response.json(await sendPush(s, "NOESIS test", "Phone notifications work. Reminders, review nudges and PC alerts will arrive here.").catch((e) => ({ sent: false, why: String(e) })));
    case "schedule_toggle": await s.update("pc_schedules", b.id, { enabled: !!b.enabled, updated_at: nowIso() }); return Response.json({ ok: true }); // Reg's own click: allowed even for commands Apollo couldn't switch on
    case "schedule_remove": await s.remove("pc_schedules", b.id); return Response.json({ ok: true });
    case "watch_remove": await save({ folder_watches: (data.folder_watches ?? []).filter((w: { path: string }) => w.path !== b.path) }); return Response.json({ ok: true });
    default: return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
