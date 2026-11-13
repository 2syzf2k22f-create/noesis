// Notes and revision websites: ingest (fetch, robots.txt, extract, chunk, tag) and search.
// Search is keyword-ranked for now; pgvector embeddings (on the relay) can replace the ranking later.
import type { Row, Store } from "./store";
import type { ToolCtx } from "./tools";

const UA = "NOESIS-personal-revision-bot/1.0";
const CHUNK = 1200;

async function robotsAllows(u: URL) {
  try {
    const r = await fetch(`${u.origin}/robots.txt`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return true;
    const lines = (await r.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
    let applies = false;
    const dis: string[] = [], allow: string[] = [];
    for (const l of lines) {
      const [k, ...rest] = l.split(":");
      const v = rest.join(":").trim();
      if (/^user-agent$/i.test(k)) applies = v === "*" || UA.toLowerCase().includes(v.toLowerCase());
      else if (applies && /^disallow$/i.test(k) && v) dis.push(v);
      else if (applies && /^allow$/i.test(k) && v) allow.push(v);
    }
    const p = u.pathname;
    const longest = (xs: string[]) => Math.max(-1, ...xs.filter((x) => p.startsWith(x)).map((x) => x.length));
    return longest(allow) >= longest(dis);
  } catch {
    return true;
  }
}

export function htmlToText(html: string) {
  const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
  return { title, text: body };
}

export function chunk(text: string, size = CHUNK) {
  const paras = text.split(/\n{2,}/);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + "\n\n" + p).length > size && cur) { out.push(cur.trim()); cur = ""; }
    cur += (cur ? "\n\n" : "") + p;
    while (cur.length > size * 1.5) { out.push(cur.slice(0, size)); cur = cur.slice(size); }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter((c) => c.length > 80);
}

export async function ingestUrl(ctx: ToolCtx, a: { url: string; subject?: string; board?: string; topic?: string }) {
  const u = new URL(a.url);
  if (!/^https?:$/.test(u.protocol)) return { error: "only http(s) urls" };
  if (!(await robotsAllows(u))) return { error: "robots.txt disallows fetching this page; not saved" };
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return { error: `site answered ${r.status}` };
  const { title, text } = htmlToText(await r.text());
  const parts = chunk(text).slice(0, 80);
  if (!parts.length) return { error: "no readable text on that page (it may need a login or be built with scripts)" };
  const src = await ctx.store.insert("sources", { url: a.url, title: title || u.hostname, subject: a.subject ?? null, board: a.board ?? null, topic: a.topic ?? null, kind: "web" });
  for (const [i, t] of parts.entries()) {
    await ctx.store.insert("note_chunks", { source_id: src.id, source_title: src.title, idx: i, text: t, subject: a.subject ?? null, board: a.board ?? null, topic: a.topic ?? null });
  }
  await ctx.store.insert("action_log", { job_id: ctx.jobId ?? null, actor: ctx.actor ?? "apollo", tool: "ingest_url", table_name: "sources", row_id: src.id, before: null, after: src, undone_at: null });
  return { saved: parts.length, title: src.title, source_id: src.id };
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];

/** The relay plugs in search-by-meaning here (relay/embed.mts); the website keeps keyword search. */
type Semantic = (s: Store, q: string, subject?: string, k?: number) => Promise<Record<string, unknown>[] | null>;
let semantic: Semantic | null = null;
export const setSemanticSearch = (f: Semantic) => { semantic = f; };

export async function searchNotes(store: Store, query: string, subject?: string, limit = 6) {
  const kw = await keywordSearch(store, query, subject, limit);
  if (!semantic) return kw;
  const sem = await semantic(store, query, subject, limit).catch(() => null);
  if (!sem?.length) return kw;
  // meaning matches first, then keyword matches not already included
  const seen = new Set(sem.map((r) => String(r.text).slice(0, 80)));
  return [...sem, ...kw.filter((r) => !seen.has(String(r.text).slice(0, 80)))].slice(0, limit + 2);
}

async function keywordSearch(store: Store, query: string, subject?: string, limit = 6) {
  const q = [...new Set(words(query))];
  if (!q.length) return [];
  const chunks = await store.list("note_chunks", { eq: subject ? { subject } : undefined, limit: 20000 });
  // Reg's own lesson/topic notes are searched too
  const own = (await store.list("notes", { eq: subject ? { subject } : undefined, isNull: ["deleted_at"], limit: 5000 }).catch(() => []))
    .map((n) => ({ ...n, text: `${n.title ?? ""}\n${n.body ?? ""}`, source_title: `My ${n.kind ?? "topic"} notes: ${n.title ?? n.topic ?? ""}` }));
  const rows: Row[] = [...own, ...chunks];
  return rows
    .map((r) => {
      const t = String(r.text).toLowerCase();
      const score = q.reduce((a, w) => a + (t.includes(w) ? 1 + Math.min(3, t.split(w).length - 2) * 0.25 : 0), 0) / q.length;
      return { r, score };
    })
    .filter((x) => x.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r, score }) => ({ source: r.source_title, subject: r.subject, topic: r.topic, text: String(r.text).slice(0, 1400), score: Math.round(score * 100) / 100 }));
}
