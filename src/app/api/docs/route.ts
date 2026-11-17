import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { DOC_MIME, findImages, saveDocument, type Doc } from "@/core/docs";

/** GET: list documents | ?images=<query> openly licensed pictures. */
export async function GET(req: NextRequest) {
  await connection();
  const q = req.nextUrl.searchParams.get("images");
  if (q) return Response.json(await findImages(q, Number(req.nextUrl.searchParams.get("n") ?? 8)));
  const s = storeOr503();
  if (s instanceof Response) return s;
  const rows = (await s.list("files", { order: { col: "created_at", asc: false }, limit: 2000 })).filter((f) => f.mime === DOC_MIME && !f.deleted_at);
  return Response.json(rows.map((f) => { let d: Partial<Doc> = {}; try { d = JSON.parse(String(f.content)); } catch {} return { id: f.id, title: d.title ?? f.name, kind: d.kind, sections: d.sections?.length ?? 0, date: f.updated_at ?? f.created_at }; }));
}
/** POST {action: save, id, doc} (from the viewer) */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (b.action === "save" && b.doc?.title) return Response.json(await saveDocument(s, b.doc as Doc, b.id ?? null));
  return Response.json({ error: "unknown action" }, { status: 400 });
}
