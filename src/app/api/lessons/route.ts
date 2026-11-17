import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { createLesson, lessonContext, stepLesson } from "@/core/lessons";
import { nowIso } from "@/core/store";

/** GET ?id= one lesson (+ context) | list (optionally ?subject=). */
export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const id = req.nextUrl.searchParams.get("id");
  if (id) { const L = await s.get("lessons", id); return L ? Response.json({ ...L, context: lessonContext(L) }) : Response.json({ error: "not found" }, { status: 404 }); }
  const subject = req.nextUrl.searchParams.get("subject");
  const rows = (await s.list("lessons", { order: { col: "updated_at", asc: false }, limit: 200 })).filter((l) => !subject || l.subject === subject);
  return Response.json(rows.map((l) => ({ id: l.id, subject: l.subject, topic: l.topic, mode: l.mode, status: l.status, idx: l.idx, total: (l.chunks ?? []).length, understood: (l.chunks ?? []).filter((c: { status: string }) => c.status === "understood").length, conversation_id: l.conversation_id, updated_at: l.updated_at ?? l.created_at, minutes: l.minutes })));
}

/** POST {action: create|step|attach|minutes|delete, ...} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "create": { if (!b.subject || !b.topic) return Response.json({ error: "subject and topic" }, { status: 400 }); const L = await createLesson(s, b); return Response.json({ ...L, context: lessonContext(L) }); }
      case "step": { const L = await stepLesson(s, b.id, { ...b, action: b.step }); return Response.json({ ...L, context: lessonContext(L) }); }
      case "attach": await s.update("lessons", b.id, { conversation_id: b.conversation_id, updated_at: nowIso() }); return Response.json({ ok: true });
      case "minutes": { const L = await s.get("lessons", b.id); if (L) await s.update("lessons", b.id, { minutes: Number(L.minutes ?? 0) + Number(b.minutes ?? 0) }); if (L && b.minutes >= 1) await s.insert("study_sessions", { subject: L.subject, topic: L.topic, label: `lesson (${L.mode})`, minutes: Number(b.minutes), spec_code: (L.chunks ?? [])[L.idx]?.code ?? null }); return Response.json({ ok: true }); }
      case "delete": await s.update("lessons", b.id, { status: "archived", updated_at: nowIso() }); return Response.json({ ok: true });
      default: return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
