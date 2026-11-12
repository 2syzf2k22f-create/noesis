import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return Response.json([]);
  const rows = await s.list("themes", { order: { col: "created_at", asc: true }, limit: 50 });
  return Response.json(rows.map((t) => ({ id: t.id, name: t.name, tokens: t.tokens })));
}
