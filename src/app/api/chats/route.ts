import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";

export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  // only direct chats with Apollo (and project chats); feature runs and language practice live on their own pages
  const space = req.nextUrl.searchParams.get("space");
  let rows = (await s.list("conversations", { isNull: ["deleted_at"], order: { col: "updated_at", asc: false }, limit: 300 }))
    .filter((c) => (space ? String(c.space ?? "").startsWith(space) : !c.space || String(c.space).startsWith("project:")));
  if (q) {
    // Title match first; message search when a title doesn't match.
    const msgs = await s.list("messages", { order: { col: "created_at", asc: false }, limit: 2000 });
    const hit = new Set(msgs.filter((m) => m.content?.toLowerCase().includes(q)).map((m) => m.conversation_id));
    rows = rows.filter((c) => c.title?.toLowerCase().includes(q) || hit.has(c.id));
  }
  rows.sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  // tokens and jobs per chat (from the usage log), so the biggest chats are visible
  const use = new Map<string, { tokens: number; jobs: number }>();
  // the token totals are only shown on the Chats page; other callers (tutor rooms, language) skip the 5000-row read
  if (!space) for (const u of await s.list("usage_log", { order: { col: "created_at", asc: false }, limit: 5000 }).catch(() => [])) {
    if (!u.conversation_id) continue;
    const x = use.get(u.conversation_id) ?? { tokens: 0, jobs: 0 };
    x.tokens += Number(u.tokens_total ?? 0); x.jobs += 1; use.set(u.conversation_id, x);
  }
  return Response.json(rows.map((c) => ({ id: c.id, title: c.title ?? "Untitled", pinned: !!c.pinned, updatedAt: c.updated_at ?? c.created_at, space: c.space ?? null, tokens: use.get(c.id)?.tokens ?? 0, jobs: use.get(c.id)?.jobs ?? 0 })));
}
