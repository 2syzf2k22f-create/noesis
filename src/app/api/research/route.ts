import { relayOnline, storeOr503 } from "@/core/api";

/** Queue a web research job on the relay: {topic: "uni" | "books" | "opportunities", query}. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (!["uni", "books", "opportunities"].includes(b.topic)) return Response.json({ error: "bad topic" }, { status: 400 });
  const job = await s.insert("jobs", { kind: "research", status: "queued", input: { topic: b.topic, query: String(b.query ?? "").slice(0, 500) }, ui_actions: [], output: null });
  const { online } = await relayOnline(s);
  return Response.json({ id: job.id, relayOnline: online });
}
