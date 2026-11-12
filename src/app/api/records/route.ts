import { storeOr503 } from "@/core/api";
import { USER_WRITABLE } from "@/core/tools";
import { nowIso } from "@/core/store";
import { derive } from "@/core/derive";

/**
 * Writes from forms and buttons on generated pages. Same action log as Apollo (actor "reg"),
 * so "Undo" covers your own edits too.
 * POST { op: "create" | "update" | "delete", table, id?, data? }
 */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (!USER_WRITABLE.has(b.table)) return Response.json({ error: "table not writable" }, { status: 400 });
  const data = typeof b.data === "object" && b.data ? { ...b.data } : {};
  delete data.id;
  derive(b.table, data);
  const log = (tool: string, id: string, before: unknown, after: unknown) =>
    s.insert("action_log", { actor: "reg", tool, table_name: b.table, row_id: id, before, after, undone_at: null });

  if (b.op === "create") {
    const row = await s.insert(b.table, data);
    await log("create_record", row.id, null, row);
    return Response.json(row);
  }
  const before = typeof b.id === "string" ? await s.get(b.table, b.id) : null;
  if (!before) return Response.json({ error: "not found" }, { status: 404 });
  if (b.op === "update") {
    const after = await s.update(b.table, b.id, { ...data, updated_at: nowIso() });
    await log("update_record", b.id, before, after);
    return Response.json(after);
  }
  if (b.op === "delete") {
    await s.insert("trash", { table_name: b.table, row_id: b.id, data: before, deleted_at: nowIso() });
    const after = await s.update(b.table, b.id, { deleted_at: nowIso() });
    await log("delete_record", b.id, before, after);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "bad op" }, { status: 400 });
}
