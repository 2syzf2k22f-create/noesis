import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";

/** POST {action: "allow" | "deny"}: only Reg's click (behind the site lock) can let a risky PC command run. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const job = await s.get("jobs", id);
  if (!job || job.kind !== "pc") return Response.json({ error: "not found" }, { status: 404 });
  if (job.status !== "proposed") return Response.json({ error: "already answered" }, { status: 409 });
  if (b.action === "deny") {
    await s.update("jobs", id, { status: "cancelled", finished_at: nowIso(), output: { step: "Denied" } });
    if (job.input?.conversation_id) await s.insert("messages", { conversation_id: job.input.conversation_id, role: "assistant", content: `Okay, I didn't run it: ${job.input.why ?? job.input.command}` }).catch(() => null);
    return Response.json({ ok: true });
  }
  if (b.action !== "allow") return Response.json({ error: "bad action" }, { status: 400 });
  await s.update("jobs", id, { status: "queued", input: { ...job.input, approved_by: "reg", approved_at: nowIso() }, output: { step: "Allowed: running on your PC" } });
  return Response.json({ ok: true });
}
