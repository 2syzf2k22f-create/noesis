// Spec import + verification (runs on Reg's PC, where the relay has internet).
// Apollo reads the official PDF and sends statements here; THIS code downloads the same PDF and checks
// every statement word-for-word against the PDF's own text. Only statements found verbatim are marked
// verified (with the page they're on). Anything else is stored as unverified, never silently.
// Re-imports update by (subject, code), keep Reg's confidence ratings, and record the old text if it changed.
import { z } from "zod";
import { nowIso, type Row, type Store } from "../src/core/store";

const pdfCache = new Map<string, { pages: string[]; norm: string[] }>();
/** Compare on letters and digits only: PDF extraction mangles spaces, hyphenation, quotes and symbols. */
/** A lone bullet at the start of a line ("o", "•", "◦", "▪", "·" + space) is the same token on both sides:
 *  Edexcel prints sub-bullets as "o", which PDF extraction reads as the letter. Only at line starts, nothing else. */
export const BULLET = /^[ \t]*(?:o|•|◦|▪|·)[ \t]+/gm;
export const norm = (t: string) => t.replace(BULLET, "\u0001").normalize("NFKD").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl").toLowerCase().replace(/[^a-z0-9]/g, "");

async function loadPdf(url: string) {
  const hit = pdfCache.get(url);
  if (hit) return hit;
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0" }, redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`${url} answered ${r.status}`);
  const { extractText, getDocumentProxy } = await import("unpdf");
  const { text } = await extractText(await getDocumentProxy(new Uint8Array(await r.arrayBuffer())), { mergePages: false });
  const pages = text as string[];
  const v = { pages, norm: pages.map(norm) };
  pdfCache.set(url, v);
  return v;
}
/** The page a passage is on (1-based), allowing it to run over onto the next page. */
function findPage(pdf: { norm: string[] }, passage: string): number | null {
  const n = norm(passage);
  if (n.length < 3) return null;
  for (let i = 0; i < pdf.norm.length; i++) {
    if (pdf.norm[i].includes(n)) return i + 1;
    if (i + 1 < pdf.norm.length && (pdf.norm[i] + pdf.norm[i + 1]).includes(n)) return i + 1;
  }
  return null;
}

/** Code sequences with holes (1.02a, 1.02c → b missing; 3.1.1, 3.1.3 → 3.1.2 missing). */
export function gaps(rows: Row[]) {
  const byParent = new Map<string, string[]>();
  for (const r of rows) if (r.parent_code != null) byParent.set(r.parent_code, [...(byParent.get(r.parent_code) ?? []), String(r.code)]);
  const out: string[] = [];
  for (const [p, codes] of byParent) {
    const tails = codes.map((c) => c.slice(p.length).replace(/^\./, ""));
    if (tails.every((t) => /^[a-z]$/.test(t))) {
      const have = new Set(tails); const max = Math.max(...tails.map((t) => t.charCodeAt(0)));
      for (let c = 97; c < max; c++) if (!have.has(String.fromCharCode(c))) out.push(`${p}${String.fromCharCode(c)}`);
    } else if (tails.every((t) => /^\d+$/.test(t))) {
      const nums = tails.map(Number), width = tails[0].length, have = new Set(nums);
      for (let n = Math.min(...nums); n < Math.max(...nums); n++) if (!have.has(n)) out.push(`${p}.${String(n).padStart(width, "0")}`.replace(/\.\./, "."));
    }
  }
  const codes = new Set(rows.map((r) => r.code));
  const orphans = rows.filter((r) => r.parent_code && !codes.has(r.parent_code)).map((r) => `${r.code} (parent ${r.parent_code} missing)`);
  return { missing_codes: out.sort(), orphans };
}

type Ctx = { store: Store; jobId: string | null };
const point = z.object({
  code: z.string().min(1).max(30), title: z.string().max(400).optional(), text: z.string().max(6000).optional(),
  notes: z.string().max(8000).optional(), examples: z.string().max(8000).optional(),
  level: z.number().int().min(1).max(4), parent_code: z.string().max(30).nullable().optional(),
  paper: z.string().max(80).optional(), optional: z.boolean().optional(), sort_order: z.number().int().optional(),
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool = { name: string; description: string; input: z.ZodRawShape; run: (ctx: Ctx, a: any) => Promise<unknown> };

export const SPEC_TOOLS: Tool[] = [
  {
    name: "import_spec_points",
    description: "Save specification content for School > Spec, copied EXACTLY from the official PDF (never from memory). Send up to ~150 points per call, in document order: level 1 section/theme, 2 topic, 3 subtopic, 4 content statement (code like 1.02a, 3.1.1, 1.1.1; parent_code links them). Put 'Notes and guidance' / 'Additional information' in notes, worked examples in examples. This tool downloads source_url itself and checks every statement against the PDF text: matches are saved as verified with their page; non-matches are saved as UNVERIFIED and listed back to you so you can fix the wording (copy it again exactly) and resend. Re-sending a code updates it and keeps Reg's confidence.",
    input: { subject: z.enum(["Maths", "Further Maths", "Physics", "Economics"]), board: z.string().max(60), source_url: z.string().url(), source_version: z.string().max(60), points: z.array(point).min(1).max(200) },
    async run(ctx, a: { subject: string; board: string; source_url: string; source_version: string; points: z.infer<typeof point>[] }) {
      const pdf = await loadPdf(a.source_url);
      const existing = new Map((await ctx.store.list("spec_points", { eq: { subject: a.subject }, limit: 5000 })).map((r) => [r.code, r]));
      let verified = 0, created = 0, updated = 0;
      const unverified: { code: string; reason: string }[] = [], changed: { code: string; before: string; after: string }[] = [];
      for (const [i, p] of a.points.entries()) {
        const passage = p.text || p.title || "";
        const page = findPage(pdf, passage);
        // a heading-only row needs its title on the page; a statement needs its full text
        const titleOk = !p.text || !p.title || findPage(pdf, p.title) != null;
        const ok = page != null && titleOk;
        if (ok) verified++; else unverified.push({ code: p.code, reason: page == null ? "text not found verbatim in the PDF" : "title not found verbatim" });
        const row = {
          subject: a.subject, board: a.board, code: p.code, title: p.title ?? null, text: p.text ?? null, notes: p.notes ?? null, examples: p.examples ?? null,
          level: p.level, parent_code: p.parent_code ?? null, paper: p.paper ?? null, optional: !!p.optional, sort_order: p.sort_order ?? i,
          source_url: a.source_url, source_version: a.source_version, source_page: page, verified: ok, verified_at: ok ? nowIso() : null, updated_at: nowIso(), deleted_at: null,
        };
        const old = existing.get(p.code);
        if (old) {
          const textChanged = (old.text ?? "") !== (p.text ?? "") && old.text;
          if (textChanged) changed.push({ code: p.code, before: String(old.text).slice(0, 300), after: String(p.text ?? "").slice(0, 300) });
          await ctx.store.update("spec_points", old.id, { ...row, ...(textChanged ? { previous_text: old.text, changed_at: nowIso() } : {}) }); // confidence, chosen, reviews kept
          updated++;
        } else { await ctx.store.insert("spec_points", { ...row, chosen: true }); created++; }
      }
      await ctx.store.insert("action_log", { actor: "apollo", tool: "import_spec_points", table_name: "spec_points", row_id: null, before: null, after: { subject: a.subject, version: a.source_version, sent: a.points.length, verified, unverified: unverified.length } }).catch(() => null);
      return { subject: a.subject, pdf_pages: pdf.pages.length, sent: a.points.length, created, updated, verified, unverified, changed_text: changed,
        next: unverified.length ? "Re-copy the unverified statements EXACTLY from the PDF page text (web_read the page range) and resend them. If one truly can't be matched (formulas, symbols), leave it unverified and tell Reg." : "All verified." };
    },
  },
  {
    name: "reverify_spec",
    description: "Re-check every stored statement of a subject against its official PDF with the current matching rules (e.g. after the bullet fix), updating verified + page. Doesn't change any text. Run spec_report afterwards.",
    input: { subject: z.enum(["Maths", "Further Maths", "Physics", "Economics"]), only_unverified: z.boolean().optional() },
    async run(ctx, a: { subject: string; only_unverified?: boolean }) {
      const rows = (await ctx.store.list("spec_points", { eq: { subject: a.subject }, limit: 5000 })).filter((r) => !r.deleted_at && r.source_url && (!a.only_unverified || !r.verified));
      let nowVerified = 0, stillUnverified: string[] = [];
      for (const r of rows) {
        const pdf = await loadPdf(r.source_url);
        const page = findPage(pdf, r.text || r.title || "");
        const ok = page != null && (!r.text || !r.title || findPage(pdf, r.title) != null);
        if (ok !== !!r.verified || page !== r.source_page) await ctx.store.update("spec_points", r.id, { verified: ok, verified_at: ok ? nowIso() : null, source_page: page });
        if (ok && !r.verified) nowVerified++;
        if (!ok) stillUnverified = [...stillUnverified, r.code];
      }
      return { checked: rows.length, newly_verified: nowVerified, unverified: stillUnverified };
    },
  },
  {
    name: "spec_report",
    description: "Verification report for a subject's imported spec: counts per level, verified vs unverified, missing codes in numbering sequences, orphans, and which PDF pages statements came from. Run it after importing and tell Reg the result.",
    input: { subject: z.enum(["Maths", "Further Maths", "Physics", "Economics"]) },
    async run(ctx, a: { subject: string }) {
      const rows = (await ctx.store.list("spec_points", { eq: { subject: a.subject }, limit: 5000 })).filter((r) => !r.deleted_at);
      const lv = (n: number) => rows.filter((r) => r.level === n).length;
      const pages = [...new Set(rows.map((r) => r.source_page).filter(Boolean))].sort((x, y) => x - y);
      return {
        subject: a.subject, total: rows.length, sections: lv(1), topics: lv(2), subtopics: lv(3), statements: lv(4),
        verified: rows.filter((r) => r.verified).length, unverified: rows.filter((r) => !r.verified).map((r) => r.code).slice(0, 300),
        sources: [...new Set(rows.map((r) => `${r.source_version ?? "?"} ${r.source_url ?? "(no source)"}`))],
        pages_covered: pages.length ? `${pages[0]}-${pages[pages.length - 1]} (${pages.length} pages)` : "none", ...gaps(rows),
      };
    },
  },
];
