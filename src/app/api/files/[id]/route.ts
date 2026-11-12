import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

/** Opens a saved file (text content stored in the database). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const f = await s.get("files", id);
  if (!f || f.deleted_at || f.content == null) return new Response("Not found", { status: 404 });
  const name = String(f.name).replace(/[^\w.\- ]/g, "_");
  return new Response(String(f.content), {
    headers: { "content-type": `${f.mime ?? "text/plain"}; charset=utf-8`, "content-disposition": `inline; filename="${name}"`, "x-content-type-options": "nosniff", "content-security-policy": "sandbox" },
  });
}
