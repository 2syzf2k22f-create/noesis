import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

/** Generated pages (not space overrides) for menus. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return Response.json([]);
  const rows = await s.list("pages", { isNull: ["deleted_at"], order: { col: "created_at", asc: true }, limit: 100 });
  return Response.json(rows.map((p) => ({ slug: p.slug, title: p.title, space: p.space ?? null, version: p.version })));
}
