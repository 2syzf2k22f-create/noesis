// Web + files for Apollo on Reg's PC: read any web page or PDF (full text, by page range), download
// documents, find files anywhere in his folders, read PDFs / Word / text / code / images, list folders,
// and write files into his NOESIS workspace. No PowerShell (nothing for antivirus to flag).
//
// Safety: downloads of programs/scripts (.exe, .msi, .bat, .ps1, ...) and reads of secrets (password
// databases, .env, SSH keys, browser profiles) are refused here; writing outside the workspace goes
// through pc_run, where it becomes an Allow card.
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { Store } from "../src/core/store";

const HOME = homedir();
export const DOWNLOADS = join(HOME, "Downloads", "NOESIS");
export const WORKSPACE = join(HOME, "Documents", "NOESIS");
const EXECUTABLE = /\.(exe|msi|msix|appx|bat|cmd|com|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|jar|scr|dll|sys|lnk|reg|hta|cpl|inf|gadget|application|msp|scf|iso|img|vhd|vhdx)$/i;
const SECRET_PATH = /(\.env(\.|$)|[\\/]\.ssh[\\/]|[\\/]\.aws[\\/]|[\\/]\.git-credentials|id_(rsa|ed25519|ecdsa)|\.(kdbx|pem|key|pfx|p12|ppk|ovpn)$|login data|cookies|local state|web data|[\\/]microsoft[\\/](credentials|protect|vault)[\\/]|[\\/]1password|[\\/]bitwarden|[\\/]keepass|wallet\.dat|\.relay|run-relay\.cmd)/i;
export const isSecretPath = (p: string) => SECRET_PATH.test(p);
const ROOTS = () => [join(HOME, "Desktop"), join(HOME, "Documents"), join(HOME, "Downloads"), join(HOME, "OneDrive"), join(HOME, "Pictures"), join(HOME, "Music"), join(HOME, "Videos"), ...(() => { try { return readdirSync(HOME).filter((d) => /^OneDrive/i.test(d)).map((d) => join(HOME, d)); } catch { return []; } })()];
const SKIP_DIR = /^(node_modules|\.git|\.next|appdata|\$recycle\.bin|windows|program files.*|\.cache|\.vscode|venv|__pycache__)$/i;
const expand = (p: string) => resolve(p.replace(/^~(?=$|[\\/])/, HOME).replace(/%USERPROFILE%/gi, HOME));

/* ---------- text extraction ---------- */
async function pdfPages(buf: Uint8Array): Promise<{ total: number; pages: string[] }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { total: totalPages, pages: (text as string[]).map((t) => t.replace(/[ \t]+\n/g, "\n").trim()) };
}
async function docxText(buf: Uint8Array) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(buf, { filter: (f) => f.name === "word/document.xml" });
  const xml = zip["word/document.xml"] ? strFromU8(zip["word/document.xml"]) : "";
  return xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}
async function pptxText(buf: Uint8Array) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(buf, { filter: (f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name) });
  return Object.keys(zip).sort((a, b) => Number(/\d+/.exec(a)![0]) - Number(/\d+/.exec(b)![0]))
    .map((k, i) => `[slide ${i + 1}]\n${strFromU8(zip[k]).replace(/<\/a:p>/g, "\n").replace(/<[^>]+>/g, "").trim()}`).join("\n\n");
}
async function xlsxText(buf: Uint8Array) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(buf, { filter: (f) => f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) });
  const shared = zip["xl/sharedStrings.xml"] ? [...strFromU8(zip["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, "")) : [];
  return Object.keys(zip).filter((k) => k.includes("worksheets")).sort().map((k) => {
    const rows = [...strFromU8(zip[k]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) =>
      [...r[1].matchAll(/<c[^>]*?(t="(\w+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>|<is><t>([\s\S]*?)<\/t><\/is>)?<\/c>/g)].map((c) => (c[2] === "s" ? shared[Number(c[3])] ?? "" : c[3] ?? c[4] ?? "")).join("\t"));
    return `[${basename(k, ".xml")}]\n${rows.join("\n")}`;
  }).join("\n\n");
}
const htmlText = (html: string) => {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const body = html.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article)[^>]*>/gi, "\n").replace(/<li[^>]*>/gi, "• ").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  return { title, body };
};
const linksOf = (html: string, base: string) => {
  const out: { text: string; url: string }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { const url = new URL(m[1], base).toString(); const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(); if (/^https?:/.test(url)) out.push({ text: text.slice(0, 120), url }); } catch {}
  }
  return out;
};
/** Slice long text by pages (PDF) or characters, so Apollo can read everything in parts. */
function window(parts: string[], from: number, to: number | undefined, maxChars: number) {
  const out: string[] = [];
  let used = 0, last = from - 1;
  for (let i = from - 1; i < Math.min(parts.length, to ?? parts.length); i++) {
    const t = `[page ${i + 1}]\n${parts[i]}`;
    if (used + t.length > maxChars && out.length) break;
    out.push(t.slice(0, maxChars)); used += t.length; last = i + 1;
  }
  return { text: out.join("\n\n"), from, to: last, more: last < parts.length ? `Pages ${last + 1}-${parts.length} not shown yet: call again with from_page=${last + 1}.` : null };
}
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

/** Read any supported file's bytes into text (or pages). */
export async function extract(buf: Uint8Array, name: string, mime = ""): Promise<{ kind: string; pages?: string[]; text?: string; image?: string; mime?: string }> {
  const ext = extname(name).toLowerCase();
  if (ext === ".pdf" || mime.includes("pdf") || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return { kind: "pdf", pages: (await pdfPages(buf)).pages };
  if (ext === ".docx") return { kind: "docx", text: await docxText(buf) };
  if (ext === ".pptx") return { kind: "pptx", text: await pptxText(buf) };
  if (ext === ".xlsx") return { kind: "xlsx", text: await xlsxText(buf) };
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(ext) || mime.startsWith("image/")) return { kind: "image", image: Buffer.from(buf).toString("base64"), mime: mime || `image/${ext.slice(1).replace("jpg", "jpeg")}` };
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  if (/html/.test(mime) || /\.html?$/.test(ext)) return { kind: "html", text: htmlText(text).body };
  if (/\u0000/.test(text.slice(0, 2000))) return { kind: "binary" };
  return { kind: "text", text };
}

type Ctx = { store: Store; jobId: string | null };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tool = { name: string; description: string; input: z.ZodRawShape; run: (ctx: Ctx, a: any) => Promise<unknown> };

export const FILE_TOOLS: Tool[] = [
  {
    name: "web_read",
    description: "Read a web page or online document IN FULL (exact text, not a summary): HTML pages (with their links, to find e.g. the official spec PDF), PDFs (by page range), Word/PowerPoint/Excel/text files. Use it after WebSearch to read sources properly. For long PDFs read in parts with from_page until 'more' is null, so nothing is missed.",
    input: { url: z.string().url(), from_page: z.number().int().min(1).optional(), to_page: z.number().int().min(1).optional(), max_chars: z.number().int().min(2000).max(120000).optional(), links: z.boolean().optional().describe("Include the page's links (default true for HTML)") },
    async run(_ctx, a: { url: string; from_page?: number; to_page?: number; max_chars?: number; links?: boolean }) {
      const r = await fetch(a.url, { headers: { "user-agent": UA, accept: "text/html,application/pdf,*/*" }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
      if (!r.ok) return { error: `${a.url} answered ${r.status}` };
      const mime = r.headers.get("content-type") ?? "";
      const buf = new Uint8Array(await r.arrayBuffer());
      if (buf.length > 80 * 1024 * 1024) return { error: "over 80 MB: use web_download instead" };
      const max = a.max_chars ?? 60000;
      const name = new URL(r.url).pathname;
      if (/html/.test(mime) || /\.html?$/.test(name) || (!/\.\w+$/.test(name) && !mime)) {
        const html = new TextDecoder().decode(buf);
        const { title, body } = htmlText(html);
        const links = a.links === false ? undefined : linksOf(html, r.url).slice(0, 300);
        return { url: r.url, title, text: body.slice(0, max), truncated: body.length > max, links };
      }
      const x = await extract(buf, name, mime);
      if (x.pages) return { url: r.url, kind: "pdf", total_pages: x.pages.length, ...window(x.pages, a.from_page ?? 1, a.to_page, max) };
      if (x.image) return { __image: { data: x.image, mimeType: x.mime! }, url: r.url };
      if (x.text != null) return { url: r.url, kind: x.kind, text: x.text.slice(0, max), truncated: x.text.length > max };
      return { error: "That's a binary file I can't read as text. Use web_download to save it." };
    },
  },
  {
    name: "web_download",
    description: `Download a file from the web to Reg's PC (default folder: ${DOWNLOADS}). Documents, PDFs, images, audio, video, archives: runs at once. Programs and scripts (.exe, .msi, .bat, .ps1 ...) are refused here: use pc_run, which asks Reg. Returns the saved path; read it with read_file.`,
    input: { url: z.string().url(), filename: z.string().max(200).optional(), folder: z.string().max(400).optional().describe("Defaults to Downloads\\NOESIS") },
    async run(ctx, a: { url: string; filename?: string; folder?: string }) {
      if (EXECUTABLE.test(a.filename ?? new URL(a.url).pathname)) return { refused: true, why: "That's a program or script. Downloading those needs Reg's OK: use pc_run (it'll show him an Allow card)." };
      const r = await fetch(a.url, { headers: { "user-agent": UA }, redirect: "follow", signal: AbortSignal.timeout(10 * 60_000) });
      if (!r.ok || !r.body) return { error: `${a.url} answered ${r.status}` };
      const cd = r.headers.get("content-disposition") ?? "";
      const fromHeader = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)?.[1];
      let name = (a.filename ?? (fromHeader ? decodeURIComponent(fromHeader) : basename(new URL(r.url).pathname)) ?? "download").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_") || "download";
      if (!extname(name) && /pdf/.test(r.headers.get("content-type") ?? "")) name += ".pdf";
      if (EXECUTABLE.test(name)) return { refused: true, why: "That's a program or script. Downloading those needs Reg's OK: use pc_run (it'll show him an Allow card)." };
      const dir = a.folder ? expand(a.folder) : DOWNLOADS;
      if (isSecretPath(dir)) return { refused: true, why: "That folder holds secrets." };
      mkdirSync(dir, { recursive: true });
      let path = join(dir, name);
      for (let i = 1; existsSync(path); i++) path = join(dir, `${basename(name, extname(name))} (${i})${extname(name)}`);
      const len = Number(r.headers.get("content-length") ?? 0);
      if (len > 2 * 1024 ** 3) return { error: "over 2 GB" };
      await pipeline(Readable.fromWeb(r.body as never), createWriteStream(path));
      const size = statSync(path).size;
      await ctx.store.insert("action_log", { actor: "apollo", tool: "web_download", table_name: null, row_id: null, before: null, after: { url: a.url, path, size } }).catch(() => null);
      return { saved: path, size_bytes: size, type: r.headers.get("content-type"), next: "read it with read_file" };
    },
  },
  {
    name: "read_file",
    description: "Read a file on Reg's PC: PDF (by page range), Word (.docx), PowerPoint (.pptx), Excel (.xlsx), text, Markdown, CSV, JSON, code, HTML, or an image (you'll see it). Accepts ~ and %USERPROFILE%. Long PDFs: keep calling with from_page until 'more' is null so nothing is missed. Secret files (passwords, .env, keys) are refused.",
    input: { path: z.string().min(1).max(1000), from_page: z.number().int().min(1).optional(), to_page: z.number().int().min(1).optional(), max_chars: z.number().int().min(2000).max(120000).optional() },
    async run(_ctx, a: { path: string; from_page?: number; to_page?: number; max_chars?: number }) {
      const p = expand(a.path);
      if (isSecretPath(p)) return { refused: true, why: "That file holds secrets (passwords, keys or tokens), so I don't read it." };
      if (!existsSync(p)) return { error: `No file at ${p}. Use find_files to search for it.` };
      const st = statSync(p);
      if (st.isDirectory()) return { error: "That's a folder: use list_folder." };
      if (st.size > 150 * 1024 * 1024) return { error: "over 150 MB" };
      const x = await extract(new Uint8Array(readFileSync(p)), p);
      const max = a.max_chars ?? 60000;
      if (x.pages) return { path: p, kind: "pdf", total_pages: x.pages.length, ...window(x.pages, a.from_page ?? 1, a.to_page, max) };
      if (x.image) return { __image: { data: x.image, mimeType: x.mime! }, path: p };
      if (x.text != null) return { path: p, kind: x.kind, chars: x.text.length, text: x.text.slice(0, max), truncated: x.text.length > max };
      return { error: "Binary file: I can't read it as text." };
    },
  },
  {
    name: "find_files",
    description: "Find files on Reg's PC by name (and optionally type and age): searches Desktop, Documents, Downloads, OneDrive, Pictures, Music, Videos (or the folders you give). Newest first. Use it whenever he mentions a file or after a download.",
    input: { query: z.string().max(200).describe("Words in the file name; '' for any"), ext: z.string().max(20).optional().describe("e.g. pdf"), newer_than_hours: z.number().min(0).optional(), folders: z.array(z.string()).max(10).optional(), limit: z.number().int().min(1).max(200).optional() },
    async run(_ctx, a: { query: string; ext?: string; newer_than_hours?: number; folders?: string[]; limit?: number }) {
      const words = a.query.toLowerCase().split(/\s+/).filter(Boolean);
      const since = a.newer_than_hours ? Date.now() - a.newer_than_hours * 3600e3 : 0;
      const hits: { path: string; size: number; modified: string; t: number }[] = [];
      let seen = 0;
      const walk = (dir: string, depth: number) => {
        if (depth > 8 || seen > 200_000) return;
        let ents;
        try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          seen++;
          const full = join(dir, e.name);
          if (e.isDirectory()) { if (!SKIP_DIR.test(e.name) && !e.name.startsWith(".")) walk(full, depth + 1); continue; }
          const n = e.name.toLowerCase();
          if (a.ext && !n.endsWith(`.${a.ext.toLowerCase().replace(/^\./, "")}`)) continue;
          if (!words.every((w) => n.includes(w))) continue;
          if (isSecretPath(full)) continue;
          try { const st = statSync(full); if (st.mtimeMs < since) continue; hits.push({ path: full, size: st.size, modified: st.mtime.toISOString(), t: st.mtimeMs }); } catch {}
        }
      };
      for (const r of (a.folders?.length ? a.folders.map(expand) : ROOTS())) if (existsSync(r)) walk(r, 0);
      hits.sort((x, y) => y.t - x.t);
      return { found: hits.length, files: hits.slice(0, a.limit ?? 40).map(({ t: _t, ...h }) => { void _t; return h; }), searched_entries: seen };
    },
  },
  {
    name: "list_folder",
    description: "List what's in a folder on Reg's PC (names, sizes, dates), newest first.",
    input: { path: z.string().min(1).max(1000) },
    async run(_ctx, a: { path: string }) {
      const p = expand(a.path);
      if (isSecretPath(p)) return { refused: true, why: "That folder holds secrets." };
      try {
        const items = readdirSync(p, { withFileTypes: true }).map((e) => { try { const st = statSync(join(p, e.name)); return { name: e.name, folder: e.isDirectory(), size: st.size, modified: st.mtime.toISOString(), t: st.mtimeMs }; } catch { return null; } }).filter(Boolean) as { t: number }[];
        items.sort((x, y) => y.t - x.t);
        return { path: p, count: items.length, items: items.slice(0, 300).map(({ t: _t, ...i }) => { void _t; return i; }) };
      } catch (e) { return { error: (e as Error).message }; }
    },
  },
  {
    name: "write_file",
    description: `Create or overwrite a text file (notes, Markdown, CSV, code, JSON) in Reg's NOESIS workspace (${WORKSPACE}) at once. To write anywhere else, use pc_run (it asks Reg first).`,
    input: { name: z.string().min(1).max(200).describe("File name or sub/path inside the workspace"), content: z.string().max(5_000_000), append: z.boolean().optional() },
    async run(ctx, a: { name: string; content: string; append?: boolean }) {
      const p = resolve(WORKSPACE, a.name);
      if (!p.startsWith(WORKSPACE)) return { refused: true, why: "Only inside the NOESIS workspace; use pc_run for other places." };
      if (EXECUTABLE.test(p)) return { refused: true, why: "No programs or scripts." };
      mkdirSync(resolve(p, ".."), { recursive: true });
      writeFileSync(p, a.append && existsSync(p) ? readFileSync(p, "utf8") + a.content : a.content, "utf8");
      await ctx.store.insert("action_log", { actor: "apollo", tool: "write_file", table_name: null, row_id: null, before: null, after: { path: p, chars: a.content.length } }).catch(() => null);
      return { written: p, chars: a.content.length };
    },
  },
];
