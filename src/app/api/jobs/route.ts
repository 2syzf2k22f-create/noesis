import { storeOr503 } from "@/core/api";

/** Queue a background job from the site: { kind: "report" | "research", input? }. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (!["report", "research"].includes(b.kind)) return Response.json({ error: "bad kind" }, { status: 400 });
  const job = await s.insert("jobs", { kind: b.kind, status: "queued", input: typeof b.input === "object" && b.input ? b.input : {}, ui_actions: [], output: null });
  return Response.json({ jobId: job.id });
}
