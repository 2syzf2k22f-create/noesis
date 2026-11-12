import { relayOnline, storeOr503, titleFrom } from "@/core/api";
import { MODEL_PREFS, type ModelPref } from "@/core/routing";
import { nowIso } from "@/core/store";

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
  if (!convId) {
    convId = (await s.insert("conversations", { title: titleFrom(text), pinned: false, deleted_at: null, updated_at: nowIso() })).id;
  }
  const msg = await s.insert("messages", { conversation_id: convId, role: "user", content: text });
  const job = await s.insert("jobs", {
    kind: "apollo", status: "queued", conversation_id: convId,
    input: { conversation_id: convId, text, model_pref: model, message_id: msg.id },
    ui_actions: [], output: null,
  });
  await s.update("conversations", convId, { updated_at: nowIso() });
  const { online } = await relayOnline(s);
  return Response.json({ jobId: job.id, conversationId: convId, relayOnline: online });
}
