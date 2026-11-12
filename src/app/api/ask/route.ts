import { relayOnline, storeOr503, titleFrom } from "@/core/api";
import { MODEL_PREFS, type ModelPref } from "@/core/routing";
import { nowIso } from "@/core/store";
import { isMode } from "@/core/modes";

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().slice(0, 8000);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  const model: ModelPref = MODEL_PREFS.includes(body.model) ? body.model : "auto";

  let convId: string | null = typeof body.conversationId === "string" ? body.conversationId : null;
  if (convId) {
    const c = await s.get("conversations", convId);
    if (!c || c.deleted_at) convId = null;
  }
  // a named thread (e.g. "project:Touchline", "tutor:Physics") keeps its own ongoing chat
  const thread = typeof body.thread === "string" ? body.thread.slice(0, 80) : null;
  if (thread) {
    convId = (await s.list("conversations", { eq: { space: thread }, isNull: ["deleted_at"], order: { col: "updated_at", asc: false }, limit: 1 }))[0]?.id ?? null;
  }
  if (!convId) {
    convId = (await s.insert("conversations", { title: thread ? thread.replace(/^\w+:/, "").trim() + " · chat" : titleFrom(text), space: thread, pinned: false, deleted_at: null, updated_at: nowIso() })).id;
  }
  const msg = await s.insert("messages", { conversation_id: convId, role: "user", content: thread?.startsWith("project:") ? `[Project: ${thread.slice(8)}] ${text}` : text });
  const job = await s.insert("jobs", {
    kind: "apollo", status: "queued", conversation_id: convId,
    input: { conversation_id: convId, text, model_pref: model, message_id: msg.id, mode: isMode(body.mode) ? body.mode : "chat" },
    ui_actions: [], output: null,
  });
  await s.update("conversations", convId, { updated_at: nowIso() });
  const { online } = await relayOnline(s);
  return Response.json({ jobId: job.id, conversationId: convId, relayOnline: online });
}
