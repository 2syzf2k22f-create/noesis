// Apollo's newer powers: chunked lessons, the revision timetable, documents with real pictures, picture
// search, running code for exact answers, timers. Kept separate from tools.ts (which spreads these in).
import { z } from "zod";
import { nowIso, type Store } from "./store";

type Ctx = { store: Store; jobId?: string | null; actor?: string };
type Def = { name: string; description: string; input: z.ZodRawShape; run: (ctx: Ctx, a: any) => Promise<unknown> }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function ui(ctx: Ctx, action: object) {
  if (!ctx.jobId) return;
  const job = await ctx.store.get("jobs", ctx.jobId);
  if (job) await ctx.store.update("jobs", ctx.jobId, { ui_actions: [...(job.ui_actions ?? []), action] });
}
const logIt = (ctx: Ctx, tool: string, table: string | null, id: string | null, after: object | null) => ctx.store.insert("action_log", { job_id: ctx.jobId ?? null, actor: ctx.actor ?? "apollo", tool, table_name: table, row_id: id, before: null, after, undone_at: null }).catch(() => null);

const figure = z.object({ query: z.string().max(200).optional().describe("search words for a real picture/diagram"), url: z.string().max(2000).optional(), caption: z.string().max(300).optional(), credit: z.string().max(300).optional(), width: z.enum(["small", "medium", "full"]).optional(), side: z.enum(["left", "right", "center"]).optional() });
const section = z.object({ heading: z.string().max(200).optional(), body: z.string().max(20000).optional().describe("Markdown: lists, tables, $maths$, ```mermaid/```chart/```plot diagrams"), figure: figure.nullable().optional(), layout: z.enum(["text", "two-column", "figure-left", "figure-right", "callout"]).optional(), level: z.number().int().min(1).max(3).optional(), page_break: z.boolean().optional() });

export const TOOLS2: Def[] = [
  {
    name: "lesson_step",
    description: "Move Reg's open lesson on: understood (he showed he gets the current chunk -> next chunk), shaky (misconception: stay and re-teach), check (record a check answer: correct true/false), back, skip, note (save a summary line).",
    input: { lesson_id: z.string(), action: z.enum(["understood", "shaky", "check", "back", "skip", "note"]), correct: z.boolean().optional(), note: z.string().max(1000).optional() },
    async run(ctx, a) {
      const { stepLesson } = await import("./lessons");
      const L = await stepLesson(ctx.store, a.lesson_id, { action: a.action === "note" ? "check" : a.action, correct: a.correct, note: a.note });
      const cur = (L.chunks ?? [])[L.idx];
      return { idx: L.idx, of: (L.chunks ?? []).length, status: L.status, next_chunk: cur ? { code: cur.code, title: cur.title, text: cur.text } : null };
    },
  },
  {
    name: "lesson_set_chunks",
    description: "Set the chunks of a lesson (when the spec had none, or to re-order/split): ordered small ideas, each {title, text (what he must know/do), code?}.",
    input: { lesson_id: z.string(), chunks: z.array(z.object({ title: z.string().max(200), text: z.string().max(1500), code: z.string().max(30).optional() })).min(1).max(40) },
    async run(ctx, a) {
      const chunks = a.chunks.map((c: { title: string; text: string; code?: string }, i: number) => ({ code: c.code ?? null, title: c.title, text: c.text, status: i === 0 ? "learning" : "todo", checks: 0, right: 0 }));
      await ctx.store.update("lessons", a.lesson_id, { chunks, idx: 0, updated_at: nowIso() });
      return { ok: true, chunks: chunks.length };
    },
  },
  {
    name: "start_lesson",
    description: "Start a chunk-by-chunk lesson for Reg and open it on screen (School › Tutor): subject, topic or spec code, mode teach|revise|exam. Use when he asks to learn/revise a topic properly.",
    input: { subject: z.string(), topic: z.string(), mode: z.enum(["teach", "revise", "exam"]).optional(), codes: z.array(z.string()).max(40).optional() },
    async run(ctx, a) {
      const { createLesson } = await import("./lessons");
      const L = await createLesson(ctx.store, a);
      await ui(ctx, { type: "go", path: `/s/school/tutor?lesson=${L.id}` });
      return { lesson_id: L.id, chunks: (L.chunks ?? []).map((c: { code: string; title: string }) => `${c.code ?? ""} ${c.title}`), note: "Opened on his screen. Tell him to press Start there (that's where the lesson runs, chunk by chunk)." };
    },
  },
  {
    name: "get_revision_week",
    description: "Reg's revision timetable for a week (sessions with times, method, why each is there, status; busy blocks; tests; homework; planned vs done).",
    input: { from: z.string().optional().describe("any date in the week, YYYY-MM-DD; default this week") },
    async run(ctx, a) {
      const { revisionWeek, revisionHelpers } = await import("./revision");
      const d = new Date(`${a.from ?? revisionHelpers.today()}T12:00:00Z`);
      const r = await revisionWeek(ctx.store, new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10));
      return { ...r, settings: undefined, busy: undefined, sessions: r.sessions.map((p) => ({ id: p.id, date: p.date, start: p.start_time, minutes: p.minutes, subject: p.subject, topic: p.topic, spec_code: p.spec_code, method: p.method, status: p.status, why: p.reason, locked: p.locked })) };
    },
  },
  {
    name: "plan_revision",
    description: "Change Reg's revision timetable. generate (fills his study windows from today using spec confidence, tests, mistakes, due reviews; settings overrides optional: days_ahead, session_min, max_per_day_min, strategy balanced|weakest|tests|interleaved, subject_weights, rest_days 1-7, availability {\"1\":[{start,end}]}), rebalance (tick off done work, move missed, thin out what he's ahead on), add (date, start_time, minutes, subject, topic, spec_code, method), move (id, date, start_time), status (id, status done|missed|partial|skipped), delete (id), clear (generated future sessions).",
    input: { action: z.enum(["generate", "rebalance", "add", "move", "status", "delete", "clear"]), settings: z.record(z.string(), z.unknown()).optional(), id: z.string().optional(), date: z.string().optional(), start_time: z.string().optional(), minutes: z.number().int().min(10).max(240).optional(), subject: z.string().optional(), topic: z.string().optional(), spec_code: z.string().optional(), method: z.string().optional(), status: z.enum(["done", "missed", "partial", "skipped", "planned"]).optional() },
    async run(ctx, a) {
      const R = await import("./revision");
      let out: unknown;
      if (a.action === "generate") out = await R.generateRevision(ctx.store, (a.settings ?? {}) as never);
      else if (a.action === "rebalance") out = await R.rebalance(ctx.store);
      else if (a.action === "add") { const m = a.minutes ?? 45; out = await ctx.store.insert("plan_items", { date: a.date, start_time: a.start_time ?? null, end_time: a.start_time ? R.revisionHelpers.hm(R.revisionHelpers.mins(a.start_time) + m) : null, minutes: m, subject: a.subject ?? null, topic: a.topic ?? a.subject ?? "Revision", spec_code: a.spec_code ?? null, method: a.method ?? "questions", source: "apollo", status: "planned", done: false, reason: "added by Apollo" }); }
      else if (a.action === "move") { const cur = await ctx.store.get("plan_items", a.id); const st = a.start_time ?? cur?.start_time; await ctx.store.update("plan_items", a.id, { date: a.date ?? cur?.date, start_time: st, end_time: st ? R.revisionHelpers.hm(R.revisionHelpers.mins(st) + Number(a.minutes ?? cur?.minutes ?? 45)) : null, minutes: a.minutes ?? cur?.minutes, reason: "moved by Apollo" }); out = { ok: true }; }
      else if (a.action === "status") { await ctx.store.update("plan_items", a.id, { status: a.status, done: a.status === "done" }); out = { ok: true }; }
      else if (a.action === "delete") { await ctx.store.remove("plan_items", a.id); out = { ok: true }; }
      else { let n = 0; for (const p of await ctx.store.list("plan_items", { limit: 3000 })) if (p.status === "planned" && p.source === "generated" && !p.locked && String(p.date) >= R.revisionHelpers.today()) { await ctx.store.remove("plan_items", p.id); n++; } out = { removed: n }; }
      await logIt(ctx, "plan_revision", "plan_items", a.id ?? null, { action: a.action });
      await ui(ctx, { type: "reload" });
      return out;
    },
  },
  {
    name: "make_document",
    description: "Make a finished, real-looking document and open it: kind report|project|cv|essay|letter|poster|revision|slides|worksheet|article, theme modern|classic|academic|minimal|bold. Sections are Markdown (tables, $maths$, ```mermaid/```chart/```plot diagrams) with optional figure {query: search words -> a real openly-licensed picture is found and credited, or url}, layout text|two-column|figure-left|figure-right|callout. CV: put contact/skills/languages in sidebar [{heading, body}]. Research facts first (WebSearch/web_read) and list sources in references. It saves to Library › Documents and exports to PDF and Word.",
    input: { kind: z.enum(["report", "project", "cv", "essay", "letter", "poster", "revision", "slides", "worksheet", "article"]), title: z.string().max(200), subtitle: z.string().max(300).optional(), author: z.string().max(100).optional(), theme: z.enum(["modern", "classic", "academic", "minimal", "bold"]).optional(), accent: z.string().max(20).optional(), cover: z.boolean().optional(), contents: z.boolean().optional(), numbered: z.boolean().optional(), sections: z.array(section).min(1).max(60), sidebar: z.array(z.object({ heading: z.string().max(100), body: z.string().max(3000) })).max(10).optional(), references: z.array(z.string().max(500)).max(60).optional() },
    async run(ctx, a) {
      const { saveDocument } = await import("./docs");
      const r = await saveDocument(ctx.store, a);
      await logIt(ctx, "make_document", "files", r.id, { title: a.title, kind: a.kind });
      await ui(ctx, { type: "go", path: `/doc/${r.id}` });
      return { document_id: r.id, opened: `/doc/${r.id}`, figures: a.sections.filter((s: { figure?: { url?: string } }) => s.figure?.url).length };
    },
  },
  {
    name: "update_document",
    description: "Change a document: set any top-level field (title, subtitle, theme, kind...), replace sections, edit some (edits [{index, heading?, body?, figure?, layout?}]), insert (insert [{at, section}]), remove (indices). Figures with a query get a real picture found.",
    input: { document_id: z.string(), title: z.string().optional(), subtitle: z.string().optional(), theme: z.string().optional(), kind: z.string().optional(), accent: z.string().optional(), sections: z.array(section).optional(), edits: z.array(section.extend({ index: z.number().int().min(0) })).optional(), insert: z.array(z.object({ at: z.number().int().min(0), section })).optional(), remove: z.array(z.number().int().min(0)).optional(), references: z.array(z.string()).optional(), sidebar: z.array(z.object({ heading: z.string(), body: z.string() })).optional() },
    async run(ctx, a) {
      const f = await ctx.store.get("files", a.document_id);
      if (!f) return { error: "no such document" };
      const d = JSON.parse(String(f.content));
      for (const k of ["title", "subtitle", "theme", "kind", "accent", "references", "sidebar"]) if (a[k] !== undefined) d[k] = a[k];
      if (a.sections) d.sections = a.sections;
      for (const e of a.edits ?? []) { const { index, ...rest } = e; if (d.sections[index]) d.sections[index] = { ...d.sections[index], ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) }; }
      for (const ins of [...(a.insert ?? [])].sort((x, y) => y.at - x.at)) d.sections.splice(ins.at, 0, ins.section);
      if (a.remove?.length) d.sections = d.sections.filter((_: unknown, i: number) => !a.remove.includes(i));
      const { saveDocument } = await import("./docs");
      await saveDocument(ctx.store, d, a.document_id);
      await ui(ctx, { type: "reload" });
      return { ok: true, sections: d.sections.length };
    },
  },
  {
    name: "find_images",
    description: "Find real, openly licensed pictures and diagrams (Wikimedia Commons, Openverse) with credits: returns url, title, credit, source. Use for documents, or show one in chat as ![caption](url).",
    input: { query: z.string().min(2).max(200), n: z.number().int().min(1).max(12).optional() },
    async run(_ctx, a) { const { findImages } = await import("./docs"); return { images: await findImages(a.query, a.n ?? 6) }; },
  },
  {
    name: "run_code",
    description: "Run JavaScript for an exact answer (calculations, statistics, simulations, checking algebra numerically, generating data for a ```chart). Sandboxed: no network or files; 3 s limit. console.log output and the last expression's value are returned.",
    input: { code: z.string().min(1).max(20000) },
    async run(_ctx, a) {
      const vm = await import("node:vm");
      const out: string[] = [];
      const fmt = (v: unknown) => (typeof v === "string" ? v : (() => { try { return JSON.stringify(v); } catch { return String(v); } })());
      const sandbox = { console: { log: (...x: unknown[]) => { if (out.length < 400) out.push(x.map(fmt).join(" ")); } }, Math, JSON, Number, String, Array, Object, Date, BigInt, Set, Map };
      try {
        const value = vm.runInNewContext(a.code, sandbox, { timeout: 3000 });
        return { output: out.join("\n").slice(0, 20000), value: value === undefined ? undefined : fmt(value).slice(0, 5000) };
      } catch (e) { return { error: String((e as Error).message ?? e), output: out.join("\n").slice(0, 5000) }; }
    },
  },
  {
    name: "set_timer",
    description: "A timer or quick reminder: Reg gets an inbox notice (and phone push if on) after `minutes` with the label. E.g. 'timer 25 minutes', 'remind me in an hour to stretch'.",
    input: { minutes: z.number().min(1).max(1440), label: z.string().max(200) },
    async run(ctx, a) {
      const at = new Date(Date.now() + a.minutes * 60000).toISOString();
      const r = await ctx.store.insert("inbox_items", { source: "Apollo timer", title: `⏰ ${a.label}`, body: `Your ${a.minutes}-minute timer is up.`, deliver_at: at, read_at: null, deleted_at: null });
      return { set: true, at, id: r.id };
    },
  },
];
