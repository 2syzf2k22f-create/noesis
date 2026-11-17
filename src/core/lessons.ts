// Chunked lessons: a topic becomes an ordered list of chunks (one per spec statement, in spec order, which is
// broadly the order things build on each other). Apollo teaches ONE chunk at a time, checks understanding,
// and only moves on when Reg shows he's got it. Revise mode asks first and only teaches the gaps; exam mode
// works through exam-style questions. Progress is saved, so a lesson resumes exactly where it stopped.
import { nowIso, type Row, type Store } from "./store";

export type Chunk = { code: string | null; title: string; text: string; status: "todo" | "learning" | "understood" | "shaky" | "skipped"; checks: number; right: number; confidence?: number | null };
export const MODES = ["teach", "revise", "exam"] as const;
const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Spec statements for a topic: by code prefix (e.g. "1.02") or by words in the topic/heading. */
export async function chunksFor(store: Store, subject: string, topic: string, codes: string[] = []): Promise<Chunk[]> {
  const pts = (await store.list("spec_points", { eq: { subject }, limit: 5000 }).catch(() => [] as Row[])).filter((p) => !p.deleted_at && !(p.optional && !p.chosen));
  const words = topic.toLowerCase().split(/[^a-z0-9.]+/).filter((w) => w.length > 2);
  const codeLike = /^\d+(\.\d+)*[a-z]?$/i.test(topic.trim()) ? [topic.trim()] : [];
  const want = [...codes, ...codeLike];
  let hits = want.length ? pts.filter((p) => want.some((c) => p.code === c || String(p.code).startsWith(c))) : [];
  if (!hits.length && words.length) {
    // a heading that matches the topic brings its whole section
    const heads = pts.filter((p) => p.level < 4 && words.every((w) => `${p.title ?? ""} ${p.text ?? ""}`.toLowerCase().includes(w)));
    if (heads.length) hits = pts.filter((p) => heads.some((h) => String(p.code).startsWith(String(h.code)) && p.code !== h.code));
    if (!hits.length) hits = pts.filter((p) => p.level === 4 && words.filter((w) => `${p.title ?? ""} ${p.text ?? ""}`.toLowerCase().includes(w)).length >= Math.min(2, words.length));
  }
  return hits.filter((p) => p.level === 4 || !pts.some((q) => q !== p && String(q.code).startsWith(String(p.code)) && q.level > p.level))
    .sort((a, b) => natural(String(a.code), String(b.code))).slice(0, 40)
    .map((p) => ({ code: p.code, title: p.title ?? p.code, text: String(p.text ?? p.title ?? "").slice(0, 900), status: "todo", checks: 0, right: 0, confidence: p.confidence ?? null }));
}

export async function createLesson(store: Store, b: { subject: string; topic: string; codes?: string[]; mode?: string; level?: string; plan_item_id?: string | null }) {
  const chunks = await chunksFor(store, b.subject, b.topic, b.codes ?? []);
  const mode = (MODES as readonly string[]).includes(String(b.mode)) ? String(b.mode) : "teach";
  // revise mode: weakest first; teach mode keeps spec order (prerequisites first)
  if (mode === "revise") chunks.sort((a, c) => (a.confidence ?? 3) - (c.confidence ?? 3));
  if (chunks[0]) chunks[0].status = "learning";
  return store.insert("lessons", { subject: b.subject, topic: b.topic, mode, level: b.level ?? "a-level", codes: b.codes ?? [], chunks, idx: 0, status: "active", minutes: 0, plan_item_id: b.plan_item_id ?? null, updated_at: nowIso() });
}

/** Move through a lesson. understood -> next chunk (+1 spec confidence after a clean check); shaky -> stays,
 *  marked for revisit; back/skip/goto for navigation. Returns the updated lesson. */
export async function stepLesson(store: Store, id: string, a: { action: "understood" | "shaky" | "back" | "skip" | "goto" | "check"; idx?: number; correct?: boolean; note?: string; chunks?: Chunk[] }) {
  const L = await store.get("lessons", id);
  if (!L) throw new Error("lesson not found");
  const chunks: Chunk[] = a.chunks ?? (Array.isArray(L.chunks) ? L.chunks : []);
  let idx = Math.min(Number(L.idx ?? 0), Math.max(0, chunks.length - 1));
  const cur = chunks[idx];
  if (a.action === "check" && cur) { cur.checks++; if (a.correct) cur.right++; }
  if (a.action === "understood" && cur) {
    cur.status = "understood";
    if (cur.code) {
      const p = (await store.list("spec_points", { eq: { subject: L.subject, code: cur.code }, limit: 1 }).catch(() => [] as Row[]))[0];
      if (p) await store.update("spec_points", p.id, { confidence: Math.min(5, Math.max(Number(p.confidence ?? 2) + (cur.right >= cur.checks ? 1 : 0), 3)), last_reviewed_at: nowIso() }).catch(() => null);
    }
    idx = chunks.findIndex((c, i) => i > idx && c.status !== "understood" && c.status !== "skipped");
    if (idx < 0) idx = chunks.findIndex((c) => c.status === "shaky");
  }
  if (a.action === "shaky" && cur) { cur.status = "shaky"; if (cur.code) { const p = (await store.list("spec_points", { eq: { subject: L.subject, code: cur.code }, limit: 1 }).catch(() => [] as Row[]))[0]; if (p && Number(p.confidence ?? 3) > 2) await store.update("spec_points", p.id, { confidence: 2 }).catch(() => null); } }
  if (a.action === "skip" && cur) { cur.status = "skipped"; idx = Math.min(chunks.length - 1, idx + 1); }
  if (a.action === "back") idx = Math.max(0, idx - 1);
  if (a.action === "goto" && a.idx != null) idx = Math.max(0, Math.min(chunks.length - 1, a.idx));
  const done = idx < 0 || chunks.every((c) => c.status === "understood" || c.status === "skipped");
  if (!done && chunks[idx] && chunks[idx].status === "todo") chunks[idx].status = "learning";
  await store.update("lessons", id, { chunks, idx: done ? chunks.length : idx, status: done ? "done" : "active", updated_at: nowIso(), ...(a.note ? { summary: `${L.summary ? `${L.summary}\n` : ""}${a.note}`.slice(-4000) } : {}) });
  return { ...L, chunks, idx: done ? chunks.length : idx, status: done ? "done" : "active" };
}

/** The rules Apollo follows inside a lesson, plus exactly where Reg is. Sent as page context with each message. */
export function lessonContext(L: Row) {
  const chunks: Chunk[] = L.chunks ?? [];
  const i = Number(L.idx ?? 0), cur = chunks[i];
  const done = chunks.filter((c) => c.status === "understood").map((c) => c.code ?? c.title);
  const shaky = chunks.filter((c) => c.status === "shaky").map((c) => c.code ?? c.title);
  const mode = String(L.mode);
  const how = mode === "revise"
    ? "REVISE mode: retrieval first. Open the chunk with ONE recall question (no teaching yet). If he gets it right and can explain why, praise briefly and call lesson_step understood. If not, find the exact gap and teach only that, then check again."
    : mode === "exam"
      ? "EXAM mode: one exam-style question at a time on this chunk, with marks [n]. Mark his answer strictly like a mark scheme (say which marking points he got), show the model answer, then lesson_step understood if he scored at least 70%, else shaky and give a similar question."
      : "TEACH mode: teach ONLY this chunk in small steps: intuition first (an analogy or picture), then the key idea, then ONE worked example (use ```steps). Keep each message short (under ~180 words). End EVERY message with ONE check question for him to answer. Don't continue until he answers.";
  return [
    `LESSON ${L.id} · ${L.subject}: ${L.topic} · ${mode} mode · level ${L.level ?? "A-level"} · chunk ${Math.min(i + 1, chunks.length)} of ${chunks.length}`,
    cur ? `CURRENT CHUNK [${cur.code ?? "-"}] ${cur.title}\nExact spec wording: "${cur.text}"\nStay inside this wording; this is what he's examined on.` : chunks.length ? "All chunks are done: give a short end-of-topic quiz (```quiz, 4 questions mixing all chunks), then a 5-line summary, then call lesson_step with action \"note\" to save the summary." : `No spec statements were found for this topic. First propose 5-10 chunks (small ideas in a sensible teaching order) and save them with lesson_set_chunks, then start chunk 1.`,
    done.length ? `Already understood: ${done.join(", ")}` : "",
    shaky.length ? `Shaky (come back to these): ${shaky.join(", ")}` : "",
    how,
    "Always: never dump the whole topic. When his answer shows he understands, call lesson_step(lesson_id, \"understood\") and then introduce the next chunk in one or two lines. If his answer shows a misconception, name it kindly, log it with the create tool on mistakes (subject, spec_code, what, fix), call lesson_step(\"shaky\"), and re-explain a different way (different analogy, a diagram via ```mermaid/```svg/```plot, or a simpler worked example). Use ```quiz for quick multiple-choice checks and ```plot / ```chart / ```mermaid / ```svg for visuals whenever a picture helps. If he sends a photo of his working, mark it line by line. When he asks, make flashcards for the chunk (create on flashcards with deck = subject, spec_code).",
  ].filter(Boolean).join("\n");
}
