import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

/** PC "always allow" rules (Settings › PC permissions). */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  return Response.json({ rules: await s.list("pc_allow_rules", { order: { col: "created_at", asc: false }, limit: 500 }) });
}

/** POST {action: "toggle", id, enabled} | {action: "delete", id} | {action: "revoke_all"}. Takes effect on the next command. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (b.action === "toggle" && typeof b.id === "string") { await s.update("pc_allow_rules", b.id, { enabled: !!b.enabled }); return Response.json({ ok: true }); }
  if (b.action === "delete" && typeof b.id === "string") { await s.remove("pc_allow_rules", b.id); return Response.json({ ok: true }); }
  if (b.action === "revoke_all") {
    const all = await s.list("pc_allow_rules", { limit: 1000 });
    for (const r of all) await s.remove("pc_allow_rules", r.id);
    return Response.json({ deleted: all.length });
  }
  return Response.json({ error: "bad action" }, { status: 400 });
}
