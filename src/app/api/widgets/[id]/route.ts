import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const w = await s.get("widgets", id);
  if (!w || w.deleted_at) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ id, name: w.name, block: w.spec });
}
