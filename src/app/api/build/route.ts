import { connection } from "next/server";
import { relayOnline, storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { BUILD_ON_HOLD, ON_HOLD_NOTE } from "@/core/buildMode";

/** Build mode requests. Only this route (driven by Reg's own typing) creates build jobs; Apollo's tools cannot. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const jobs = await s.list("jobs", { eq: { kind: "build" }, order: { col: "created_at", asc: false }, limit: 300 });
  const settings = await s.get("settings", "main");
  const { online } = await relayOnline(s);
  return Response.json({ onHold: BUILD_ON_HOLD, autoShip: !!settings?.data?.auto_ship, relayOnline: online, builds: jobs.map((j) => ({ id: j.id, status: j.status, request: j.input?.request, title: j.input?.summary ?? null, proposed: j.input?.proposed_by === "apollo", at: j.created_at, started: j.started_at ?? null, finished: j.finished_at, error: j.error, ...(j.output ?? {}) })) });
}

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.autoShip === "boolean") {
    const cur = await s.get("settings", "main");
    const data = { ...(cur?.data ?? {}), auto_ship: b.autoShip };
    if (cur) await s.update("settings", "main", { data, updated_at: nowIso() }); else await s.insert("settings", { id: "main", data });
    return Response.json({ ok: true });
  }
  // one click: delete every failed and cancelled build (to the trash, restorable for 30 days)
  if (b.action === "clear") {
    const old = (await s.list("jobs", { eq: { kind: "build" }, limit: 1000 })).filter((j) => j.status === "error" || j.status === "cancelled");
    for (const j of old) { await s.insert("trash", { table_name: "jobs", row_id: j.id, data: j, deleted_at: nowIso() }); await s.remove("jobs", j.id); }
    return Response.json({ deleted: old.length });
  }
  if (BUILD_ON_HOLD) return Response.json({ error: ON_HOLD_NOTE }, { status: 409 });
  const request = String(b.request ?? "").trim().slice(0, 4000);
  if (request.length < 5) return Response.json({ error: "describe the change" }, { status: 400 });
  const job = await s.insert("jobs", { kind: "build", status: "queued", input: { request, by: "reg" }, ui_actions: [], output: { step: "Queued: waiting for the relay on your PC" } });
  return Response.json({ id: job.id });
}
