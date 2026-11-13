import { storeOr503 } from "@/core/api";

/** POST {action: "ship" | "rollback"} for a finished build. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const build = await s.get("jobs", id);
  if (!build || build.kind !== "build") return Response.json({ error: "not found" }, { status: 404 });
  if (b.action !== "ship" && b.action !== "rollback") return Response.json({ error: "bad action" }, { status: 400 });
  if (b.action === "ship" && (build.status !== "done" || build.output?.shipped || build.output?.rolled_back)) return Response.json({ error: "this build can't be shipped" }, { status: 409 });
  const job = await s.insert("jobs", { kind: b.action, status: "queued", input: { build_job_id: id }, ui_actions: [], output: null });
  await s.update("jobs", id, { output: { ...(build.output ?? {}), step: b.action === "ship" ? "Shipping…" : "Rolling back…" } });
  return Response.json({ id: job.id });
}
