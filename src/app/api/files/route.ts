import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso, type Row } from "@/core/store";
import { copyObject, removeObjects, signUpload, storageReady } from "@/core/storage";

const MAX_BYTES = 25 * 1024 * 1024;
const TEXT = /^(text\/|application\/(json|xml|javascript|x-yaml|x-sh|sql))/;
const OK_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|ya?ml|html?|css|js|jsx|ts|tsx|py|java|c|cpp|h|cs|go|rs|rb|php|sh|sql|tex|log|ini|toml|pdf|png|jpe?g|gif|webp|svg|bmp|docx|pptx|xlsx|mp3|m4a|wav|mp4|mov|zip)$/i;
const BLOCK = /\.(exe|msi|bat|cmd|ps1|vbs|scr|dll|jar|com|lnk|reg|hta)$/i;
const strip = (f: Row) => ({ ...f, content: undefined, has_content: f.content != null, versions: Array.isArray(f.versions) ? f.versions.length : 0 });
const days30 = () => new Date(Date.now() - 30 * 864e5).toISOString();

/** List files (or the trash). ?q= searches names AND contents and returns a snippet around the match. */
export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
  const trash = req.nextUrl.searchParams.get("trash") === "1";
  const all = await s.list("files", { order: { col: "created_at", asc: false }, limit: 2000 });
  let rows = all.filter((f) => (trash ? f.deleted_at && f.deleted_at > days30() : !f.deleted_at));
  const snippets: Record<string, string> = {};
  if (q) {
    rows = rows.filter((f) => {
      const inName = String(f.name).toLowerCase().includes(q);
      const c = String(f.content ?? ""), i = c.toLowerCase().indexOf(q);
      if (i >= 0) snippets[f.id] = `${i > 60 ? "…" : ""}${c.slice(Math.max(0, i - 60), i + q.length + 80).replace(/\s+/g, " ")}…`;
      return inName || i >= 0 || (f.tags ?? []).some((t: string) => t.toLowerCase().includes(q)) || String(f.folder ?? "").toLowerCase().includes(q);
    });
  }
  const live = all.filter((f) => !f.deleted_at);
  return Response.json({
    files: rows.map((f) => ({ ...strip(f), snippet: snippets[f.id] ?? null })),
    totals: { count: live.length, bytes: live.reduce((a, f) => a + Number(f.size_bytes ?? 0), 0), stored: live.filter((f) => f.storage_path).reduce((a, f) => a + Number(f.size_bytes ?? 0), 0) },
    limit_bytes: MAX_BYTES, storage: storageReady(),
  });
}

/** POST {action, ...}: create | upload_url | update | edit | restore_version | duplicate | delete | restore | purge */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const get = async (id: string) => { const f = await s.get("files", id); if (!f) throw new Error("not found"); return f; };
  try {
    switch (b.action) {
      case "create": {
        const name = String(b.name ?? "").trim().slice(0, 200) || "Untitled.md";
        const content = String(b.content ?? "");
        if (content.length > 2_000_000) return Response.json({ error: "Text files can be up to 2 MB here." }, { status: 413 });
        const row = await s.insert("files", { name, content, mime: b.mime ?? (name.endsWith(".md") ? "text/markdown" : "text/plain"), size_bytes: new TextEncoder().encode(content).length, source: "me", folder: b.folder ?? null, tags: [], starred: false, versions: [], deleted_at: null });
        return Response.json({ file: strip(row) });
      }
      case "upload_url": {
        const name = String(b.name ?? "").slice(0, 200), size = Number(b.size ?? 0), mime = String(b.mime ?? "");
        if (BLOCK.test(name)) return Response.json({ error: `${name}: programs and scripts can't be uploaded.` }, { status: 415 });
        if (!OK_EXT.test(name) && !TEXT.test(mime) && !mime.startsWith("image/")) return Response.json({ error: `${name}: that file type isn't supported.` }, { status: 415 });
        if (size > MAX_BYTES) return Response.json({ error: `${name} is ${(size / 1048576).toFixed(1)} MB; the limit is ${MAX_BYTES / 1048576} MB.` }, { status: 413 });
        if (!storageReady()) return Response.json({ error: "File storage isn't configured." }, { status: 503 });
        const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${name.replace(/[^\w.\- ]/g, "_")}`;
        const row = await s.insert("files", { name, mime: mime || "application/octet-stream", size_bytes: size, storage_path: path, content: typeof b.text === "string" ? b.text.slice(0, 2_000_000) : null, source: "me", folder: b.folder ?? null, tags: [], starred: false, versions: [], deleted_at: null });
        return Response.json({ file: strip(row), upload: await signUpload(path) });
      }
      case "update": { // rename, star, folder, tags, subject
        const f = await get(b.id);
        const patch: Record<string, unknown> = {};
        if (typeof b.name === "string" && b.name.trim()) patch.name = b.name.trim().slice(0, 200);
        if (typeof b.starred === "boolean") patch.starred = b.starred;
        if ("folder" in b) patch.folder = b.folder ? String(b.folder).slice(0, 100) : null;
        if (Array.isArray(b.tags)) patch.tags = b.tags.map(String).slice(0, 20);
        if ("subject" in b) patch.subject = b.subject || null;
        return Response.json({ file: strip({ ...f, ...(await s.update("files", f.id, { ...patch, updated_at: nowIso() })) }) });
      }
      case "edit": { // save text, keeping the last 10 versions
        const f = await get(b.id);
        if (f.storage_path && f.content == null) return Response.json({ error: "Only text files can be edited." }, { status: 409 });
        const versions = [{ at: f.updated_at ?? f.created_at, content: f.content }, ...(Array.isArray(f.versions) ? f.versions : [])].slice(0, 10);
        const content = String(b.content ?? "");
        await s.update("files", f.id, { content, size_bytes: new TextEncoder().encode(content).length, versions, updated_at: nowIso() });
        return Response.json({ ok: true });
      }
      case "versions": { const f = await get(b.id); return Response.json({ versions: (f.versions ?? []).map((v: Row, i: number) => ({ i, at: v.at, chars: String(v.content ?? "").length, preview: String(v.content ?? "").slice(0, 200) })) }); }
      case "restore_version": {
        const f = await get(b.id);
        const v = (f.versions ?? [])[Number(b.i)];
        if (!v) return Response.json({ error: "no such version" }, { status: 404 });
        const versions = [{ at: f.updated_at ?? f.created_at, content: f.content }, ...(f.versions ?? []).filter((_: unknown, i: number) => i !== Number(b.i))].slice(0, 10);
        await s.update("files", f.id, { content: v.content, size_bytes: String(v.content ?? "").length, versions, updated_at: nowIso() });
        return Response.json({ ok: true });
      }
      case "duplicate": {
        const f = await get(b.id);
        const name = String(f.name).replace(/(\.[^.]+)?$/, " (copy)$1");
        let storage_path = null;
        if (f.storage_path) { storage_path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${name.replace(/[^\w.\- ]/g, "_")}`; await copyObject(f.storage_path, storage_path); }
        const row = await s.insert("files", { name, content: f.content, mime: f.mime, size_bytes: f.size_bytes, storage_path, project: f.project ?? null, source: "me", folder: f.folder ?? null, tags: f.tags ?? [], starred: false, versions: [], deleted_at: null });
        return Response.json({ file: strip(row) });
      }
      case "delete": case "restore": {
        const ids: string[] = Array.isArray(b.ids) ? b.ids : [b.id];
        for (const id of ids) {
          const f = await s.get("files", id);
          if (!f) continue;
          if (b.action === "delete") { await s.insert("trash", { table_name: "files", row_id: id, data: { ...f, content: f.content ? String(f.content).slice(0, 200) : null }, deleted_at: nowIso() }); await s.update("files", id, { deleted_at: nowIso() }); }
          else await s.update("files", id, { deleted_at: null });
        }
        return Response.json({ ok: true, count: ids.length });
      }
      case "purge": { // delete forever (only from the trash)
        const ids: string[] = Array.isArray(b.ids) ? b.ids : [b.id];
        const gone: string[] = [];
        for (const id of ids) {
          const f = await s.get("files", id);
          if (!f?.deleted_at) continue;
          if (f.storage_path) gone.push(f.storage_path);
          await s.remove("files", id);
        }
        await removeObjects(gone).catch(() => null);
        return Response.json({ ok: true });
      }
    }
    return Response.json({ error: "bad action" }, { status: 400 });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
