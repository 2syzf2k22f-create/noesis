import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

/** Public, read-only: the one thing a share token points at. Nothing else of the site is reachable this way. */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { token } = await params;
  const sh = await s.get("shares", token);
  if (!sh || sh.revoked || (sh.expires_at && Date.parse(sh.expires_at) < Date.now())) return Response.json({ error: "This link has expired or been switched off." }, { status: 404 });
  await s.update("shares", token, { views: Number(sh.views ?? 0) + 1 }).catch(() => null);
  if (sh.kind === "doc") { const f = await s.get("files", sh.ref_id); return f ? Response.json({ kind: "doc", title: sh.title, doc: JSON.parse(String(f.content)) }) : Response.json({ error: "gone" }, { status: 404 }); }
  if (sh.kind === "deck") {
    const cards = (await s.list("flashcards", { eq: { deck: sh.ref_id }, limit: 1000 })).filter((c) => !c.deleted_at).map((c) => ({ front: c.front, back: c.back, topic: c.topic }));
    return Response.json({ kind: "deck", title: sh.title || sh.ref_id, cards });
  }
  // quiz: a question-bank topic ("Subject|topic"), mark schemes included
  const [subject, topic] = sh.ref_id.split("|");
  const qs = (await s.list("questions", { eq: { subject }, limit: 1000 })).filter((q) => !q.deleted_at && (!topic || q.topic === topic)).slice(0, 60).map((q) => ({ question: q.question, marks: q.marks, mark_scheme: q.mark_scheme ?? q.answer ?? null }));
  return Response.json({ kind: "quiz", title: sh.title || `${subject}${topic ? `: ${topic}` : ""}`, questions: qs });
}
