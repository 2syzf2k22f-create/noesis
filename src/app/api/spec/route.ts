import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { priority, reviewDue, specWithEvidence } from "@/core/spec";

/** School > Spec: statements (with evidence) for a subject, or the top priorities across subjects. */
export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const subject = req.nextUrl.searchParams.get("subject") ?? undefined;
  const rows = await specWithEvidence(s, subject);
  const view = req.nextUrl.searchParams.get("view");
  if (view === "weak") {
    const live = rows.filter((r) => r.level === 4 && !(r.optional && !r.chosen));
    return Response.json({ weak: live.sort((a, b) => priority(b) - priority(a)).slice(0, Number(req.nextUrl.searchParams.get("limit") ?? 12)),
      due: live.filter((r) => r.confidence != null && reviewDue(r) <= Date.now()).sort((a, b) => reviewDue(a) - reviewDue(b)).slice(0, 30) });
  }
  return Response.json({ rows });
}

/** POST {id, confidence?, reviewed?} or {subject, code, chosen} (applies to that option's whole subtree). */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.chosen === "boolean" && b.subject && b.code) {
    const rows = await s.list("spec_points", { eq: { subject: b.subject }, limit: 10000 });
    for (const r of rows) if (r.code === b.code || String(r.code).startsWith(`${b.code}.`) || String(r.code).startsWith(b.code)) await s.update("spec_points", r.id, { chosen: b.chosen });
    return Response.json({ ok: true });
  }
  if (!b.id) return Response.json({ error: "id needed" }, { status: 400 });
  const patch: Record<string, unknown> = {};
  if (b.confidence === null || (Number.isInteger(b.confidence) && b.confidence >= 1 && b.confidence <= 5)) patch.confidence = b.confidence;
  if (b.reviewed || "confidence" in patch) patch.last_reviewed_at = nowIso();
  await s.update("spec_points", b.id, patch);
  return Response.json({ ok: true });
}
