// Smart search: sentence embeddings on your PC (all-MiniLM-L6-v2, 384 dimensions, ~25 MB, downloaded once).
// No tokens and no cloud calls. Used to index notes/knowledge and to search them by meaning.
import type { Store } from "../src/core/store";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipe: any = null;
async function model() {
  if (!pipe) {
    const { pipeline } = await import("@huggingface/transformers");
    pipe = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
  }
  return pipe;
}
export async function embed(texts: string[]): Promise<number[][]> {
  const m = await model();
  const out = await m(texts.map((t) => t.slice(0, 2000)), { pooling: "mean", normalize: true });
  return out.tolist() as number[][];
}
const vec = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

/** Index anything not yet embedded (a batch per call, so it never hogs the PC). */
export async function indexPending(s: Store, batch = 32) {
  let done = 0;
  for (const [table, text] of [["note_chunks", (r: { text?: string; source_title?: string }) => `${r.source_title ?? ""}\n${r.text ?? ""}`], ["notes", (r: { title?: string; topic?: string; body?: string }) => `${r.title ?? ""} ${r.topic ?? ""}\n${r.body ?? ""}`]] as const) {
    const rows = await s.list(table, { isNull: ["embedding"], limit: batch });
    if (!rows.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vs = await embed(rows.map((r) => (text as (r: any) => string)(r)));
    for (const [i, r] of rows.entries()) await s.update(table, r.id, { embedding: vec(vs[i]) });
    done += rows.length;
  }
  return done;
}

/** Search by meaning (falls back to keywords if the database function isn't there). */
export async function semanticSearch(s: Store, query: string, subject?: string, k = 8) {
  if (!s.rpc) return null;
  const [q] = await embed([query]);
  const rows = (await s.rpc("match_knowledge", { query: vec(q), k, subj: subject ?? null })) as { kind: string; title: string; text: string; subject: string; url: string; similarity: number }[];
  return rows.filter((r) => r.similarity > 0.25).map((r) => ({ source: r.kind === "note" ? `My notes: ${r.title}` : r.title, subject: r.subject, url: r.url ?? undefined, text: String(r.text).slice(0, 1400), score: Math.round(r.similarity * 100) / 100, match: "meaning" }));
}
