import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { chunk, ingestUrl } from "@/core/notes";

/** Apollo's knowledge sources: websites, pasted text and files you add. Apollo searches them (search_notes). */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const [sources, chunks] = await Promise.all([s.list("sources", { order: { col: "created_at", asc: false }, limit: 500 }), s.list("note_chunks", { limit: 20000 })]);
  const n = new Map<string, number>();
  for (const c of chunks) n.set(c.source_id, (n.get(c.source_id) ?? 0) + 1);
  return Response.json(sources.filter((x) => !x.deleted_at).map((x) => ({ id: x.id, title: x.title, url: x.url, kind: x.kind, subject: x.subject, topic: x.topic, chunks: n.get(x.id) ?? 0, at: x.created_at })));
}

/** POST {url} | {title, text, kind?} with optional subject/topic; DELETE ?id= removes a source and its chunks. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const meta = { subject: b.subject || undefined, topic: b.topic || undefined };
  if (typeof b.url === "string" && b.url.trim()) {
    try { return Response.json(await ingestUrl({ store: s, actor: "reg" }, { url: b.url.trim(), ...meta })); }
    catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  }
  const text = String(b.text ?? "").slice(0, 2_000_000);
  if (text.trim().length < 80) return Response.json({ error: "add more text (at least a paragraph)" }, { status: 400 });
  const parts = chunk(text).slice(0, 600);
  const src = await s.insert("sources", { title: String(b.title || "Pasted text").slice(0, 200), kind: b.kind === "file" ? "file" : "text", url: null, subject: meta.subject ?? null, topic: meta.topic ?? null });
  for (const [i, t] of parts.entries()) await s.insert("note_chunks", { source_id: src.id, source_title: src.title, idx: i, text: t, subject: meta.subject ?? null, topic: meta.topic ?? null });
  await s.insert("action_log", { actor: "reg", tool: "add_knowledge", table_name: "sources", row_id: src.id, before: null, after: src, undone_at: null });
  return Response.json({ saved: parts.length, title: src.title, source_id: src.id });
}

export async function DELETE(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id" }, { status: 400 });
  for (const c of await s.list("note_chunks", { eq: { source_id: id }, limit: 5000 })) await s.remove("note_chunks", c.id);
  await s.remove("sources", id);
  return Response.json({ ok: true });
}
