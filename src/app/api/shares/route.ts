import { connection } from "next/server";
import { randomBytes } from "node:crypto";
import { storeOr503 } from "@/core/api";

/** Reg's share links: GET list, POST {kind: doc|deck|quiz, ref_id, title, days?} create, POST {revoke: token}. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  return Response.json((await s.list("shares", { order: { col: "created_at", asc: false }, limit: 200 })).filter((x) => !x.revoked));
}
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (b.revoke) { await s.update("shares", b.revoke, { revoked: true }); return Response.json({ ok: true }); }
  if (!["doc", "deck", "quiz"].includes(b.kind) || !b.ref_id) return Response.json({ error: "kind and ref_id" }, { status: 400 });
  const token = randomBytes(18).toString("base64url");
  await s.insert("shares", { id: token, token, kind: b.kind, ref_id: String(b.ref_id), title: String(b.title ?? "").slice(0, 200), expires_at: b.days ? new Date(Date.now() + Number(b.days) * 864e5).toISOString() : null, revoked: false, views: 0 });
  return Response.json({ token, url: `/share/${token}` });
}
