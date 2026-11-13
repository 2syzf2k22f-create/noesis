import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";

type P = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: P) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const c = await s.get("conversations", id);
  if (!c || c.deleted_at) return Response.json({ error: "not_found" }, { status: 404 });
  const messages = await s.list("messages", { eq: { conversation_id: id }, order: { col: "created_at", asc: true }, limit: 500 });
  return Response.json({
    id, title: c.title, pinned: !!c.pinned,
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content, model: m.model ?? null, at: m.created_at })),
  });
}

/** Pin, rename or (soft) delete. Deleted chats go to the trash like everything else. */
export async function PATCH(req: Request, { params }: P) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { id } = await params;
  const before = await s.get("conversations", id);
  if (!before) return Response.json({ error: "not_found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (typeof b.pinned === "boolean") patch.pinned = b.pinned;
  if (typeof b.title === "string") { patch.title = b.title.slice(0, 120); patch.title_set_by = "user"; }
  if (b.deleted === true) {
    patch.deleted_at = nowIso();
    await s.insert("trash", { table_name: "conversations", row_id: id, data: before, deleted_at: nowIso() });
  }
  const after = await s.update("conversations", id, patch);
  await s.insert("action_log", { actor: "reg", tool: b.deleted ? "delete_record" : "update_record", table_name: "conversations", row_id: id, before, after, undone_at: null });
  return Response.json({ ok: true });
}
