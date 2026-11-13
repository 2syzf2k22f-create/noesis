import { connection } from "next/server";
import { relayOnline, storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";

/** Build mode requests. Only this route (driven by Reg's own typing) creates build jobs; Apollo's tools cannot. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const jobs = await s.list("jobs", { eq: { kind: "build" }, order: { col: "created_at", asc: false }, limit: 30 });
  const settings = await s.get("settings", "main");
  const { online } = await relayOnline(s);
  return Response.json({ autoShip: !!settings?.data?.auto_ship, relayOnline: online, builds: jobs.map((j) => ({ id: j.id, status: j.status, request: j.input?.request, at: j.created_at, finished: j.finished_at, error: j.error, ...(j.output ?? {}) })) });
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
  const request = String(b.request ?? "").trim().slice(0, 4000);
  if (request.length < 5) return Response.json({ error: "describe the change" }, { status: 400 });
  const job = await s.insert("jobs", { kind: "build", status: "queued", input: { request, by: "reg" }, ui_actions: [], output: { step: "Queued: waiting for the relay on your PC" } });
  return Response.json({ id: job.id });
}
