import { storeOr503 } from "@/core/api";

/** POST {action: "ship" | "rollback"} for a finished build. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const build = await s.get("jobs", id);
  if (!build || build.kind !== "build") return Response.json({ error: "not found" }, { status: 404 });
  // approving Apollo's proposal: only Reg's click (this route, behind the site lock) can start it
  if (b.action === "approve" || b.action === "decline") {
    if (build.status !== "proposed") return Response.json({ error: "not a proposal" }, { status: 409 });
    if (b.action === "decline") { await s.update("jobs", id, { status: "cancelled", output: { step: "Declined" } }); return Response.json({ ok: true }); }
    await s.update("jobs", id, { status: "queued", input: { ...build.input, by: "reg", approved_at: new Date().toISOString() }, output: { step: "Queued: waiting for the relay on your PC" } });
    return Response.json({ ok: true });
  }
  // retry a failed build with the same request (your click, like any build)
  if (b.action === "retry") {
    if (build.status !== "error") return Response.json({ error: "only failed builds can be retried" }, { status: 409 });
    const job = await s.insert("jobs", { kind: "build", status: "queued", input: { request: build.input?.request, summary: build.input?.summary ?? null, by: "reg", retry_of: id }, ui_actions: [], output: { step: "Queued: waiting for the relay on your PC" } });
    return Response.json({ id: job.id });
  }
  if (b.action !== "ship" && b.action !== "rollback") return Response.json({ error: "bad action" }, { status: 400 });
  if (b.action === "ship" && (build.status !== "done" || build.output?.shipped || build.output?.rolled_back)) return Response.json({ error: "this build can't be shipped" }, { status: 409 });
  const job = await s.insert("jobs", { kind: b.action, status: "queued", input: { build_job_id: id }, ui_actions: [], output: null });
  await s.update("jobs", id, { output: { ...(build.output ?? {}), step: b.action === "ship" ? "Shipping…" : "Rolling back…" } });
  return Response.json({ id: job.id });
}
