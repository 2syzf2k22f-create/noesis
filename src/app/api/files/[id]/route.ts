import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { signDownload } from "@/core/storage";

/** Opens a saved file: text from the database, or a short-lived link to an uploaded file. ?download=1 saves it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const f = await s.get("files", id);
  if (!f || (f.content == null && !f.storage_path)) return new Response("Not found", { status: 404 });
  const name = String(f.name).replace(/[^\w.\- ]/g, "_");
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (f.storage_path) return Response.redirect(await signDownload(f.storage_path, 600, download ? name : undefined), 302);
  return new Response(String(f.content), {
    headers: { "content-type": `${f.mime ?? "text/plain"}; charset=utf-8`, "content-disposition": `${download ? "attachment" : "inline"}; filename="${name}"`, "x-content-type-options": "nosniff", "content-security-policy": "sandbox" },
  });
}
