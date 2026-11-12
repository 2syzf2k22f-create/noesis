import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const rows = await s.list("action_log", { order: { col: "created_at", asc: false }, limit: 30 });
  return Response.json(rows.map((r) => ({
    id: r.id, tool: r.tool, table: r.table_name, at: r.created_at, undone: !!r.undone_at,
    label: r.after?.title ?? r.after?.name ?? r.after?.theme_id ?? r.before?.title ?? r.before?.name ?? r.row_id ?? "",
  })));
}
