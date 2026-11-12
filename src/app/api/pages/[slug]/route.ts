import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return Response.json({ error: "not_configured" }, { status: 503 });
  const { slug } = await params;
  const p = (await s.list("pages", { eq: { slug }, isNull: ["deleted_at"], limit: 1 }))[0];
  if (!p) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ slug, title: p.title, spec: p.spec, version: p.version });
}
