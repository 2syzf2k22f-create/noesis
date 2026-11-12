import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const j = await s.get("jobs", id);
  if (!j) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({
    status: j.status, output: j.output ?? null, ui: j.ui_actions ?? [],
    error: j.error ?? null, retryAt: j.retry_at ?? null,
  });
}
