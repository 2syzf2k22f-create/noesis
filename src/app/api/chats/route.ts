import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";

export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  let rows = await s.list("conversations", { isNull: ["deleted_at"], order: { col: "updated_at", asc: false }, limit: 200 });
  if (q) {
    // Title match first; message search when a title doesn't match.
    const msgs = await s.list("messages", { order: { col: "created_at", asc: false }, limit: 2000 });
    const hit = new Set(msgs.filter((m) => m.content?.toLowerCase().includes(q)).map((m) => m.conversation_id));
    rows = rows.filter((c) => c.title?.toLowerCase().includes(q) || hit.has(c.id));
  }
  rows.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  return Response.json(rows.map((c) => ({ id: c.id, title: c.title ?? "Untitled", pinned: !!c.pinned, updatedAt: c.updated_at ?? c.created_at })));
}
