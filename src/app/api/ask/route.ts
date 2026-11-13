import { relayOnline, storeOr503, titleFrom } from "@/core/api";
import { MODEL_PREFS, type ModelPref } from "@/core/routing";
import { nowIso } from "@/core/store";
import { isMode } from "@/core/modes";
import { pickConversation } from "@/core/threads";

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? "").trim().slice(0, 8000);
  // up to 4 images (pasted screenshots or a picture of the page), JPEG/PNG data URLs, ~2 MB each max
  const images: string[] = (Array.isArray(body.images) ? body.images : []).filter((x: unknown) => typeof x === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(x) && x.length < 2_800_000).slice(0, 4);
  if (!text) return Response.json({ error: "empty" }, { status: 400 });
  const model: ModelPref = MODEL_PREFS.includes(body.model) ? body.model : "auto";

  let convId: string | null = typeof body.conversationId === "string" ? body.conversationId : null;
  if (convId) {
    const c = await s.get("conversations", convId);
    if (!c || c.deleted_at) convId = null;
  }
  // new topic -> new chat; a message about an earlier chat continues it (unless you chose a chat yourself)
  let switched: { how: "new" | "continued" | null; title?: string } = { how: null };
  if (!body.thread && body.autoThread !== false) {
    const p = await pickConversation(s, text, convId).catch(() => null);
    if (p) { switched = { how: p.how, title: "title" in p ? p.title : undefined }; convId = p.id; }
  }
  // a named thread (e.g. "project:Touchline", "tutor:Physics") keeps its own ongoing chat
  const thread = typeof body.thread === "string" ? body.thread.slice(0, 80) : null;
  if (thread) {
    convId = (await s.list("conversations", { eq: { space: thread }, isNull: ["deleted_at"], order: { col: "updated_at", asc: false }, limit: 1 }))[0]?.id ?? null;
  }
  if (!convId) {
    convId = (await s.insert("conversations", { title: thread ? thread.replace(/^\w+:/, "").trim() + " · chat" : titleFrom(text), space: thread, pinned: false, deleted_at: null, updated_at: nowIso() })).id;
  }
  const msg = await s.insert("messages", { conversation_id: convId, role: "user", content: `${thread?.startsWith("project:") ? `[Project: ${thread.slice(8)}] ` : ""}${text}${images.length ? ` [${images.length} image${images.length > 1 ? "s" : ""}]` : ""}` });
  const job = await s.insert("jobs", {
    kind: "apollo", status: "queued", conversation_id: convId,
    input: { conversation_id: convId, text, model_pref: model, message_id: msg.id, mode: isMode(body.mode) ? body.mode : "chat", images, screen: typeof body.screen === "string" ? body.screen.slice(0, 10000) : null },
    ui_actions: [], output: null,
  });
  await s.update("conversations", convId, { updated_at: nowIso() });
  const { online } = await relayOnline(s);
  return Response.json({ jobId: job.id, conversationId: convId, relayOnline: online, switched: switched.how === "new" && body.conversationId ? "new" : switched.how === "continued" ? "continued" : null, switchedTitle: switched.title ?? null });
}
