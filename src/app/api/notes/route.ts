import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso, type Row } from "@/core/store";

const lite = (n: Row) => ({ id: n.id, title: n.title, subject: n.subject, topic: n.topic, kind: n.kind, spec_code: n.spec_code, tags: n.tags ?? [], pinned: !!n.pinned, color: n.color, lesson_date: n.lesson_date, review: !!n.review_at, updated_at: n.updated_at ?? n.created_at, source: n.source, preview: String(n.body ?? "").replace(/[#*`>$\\]/g, "").slice(0, 160), words: String(n.body ?? "").split(/\s+/).filter(Boolean).length, links: (n.links ?? []).length });

/** GET: list (lite, searchable by ?q= in title+body) | ?id= one note with body, links, versions count, topic resources. */
export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    const n = await s.get("notes", id);
    if (!n) return Response.json({ error: "not found" }, { status: 404 });
    const res = (await s.list("resource_links", { limit: 500 }).catch(() => [] as Row[])).filter((r) => (r.subject ?? null) === (n.subject ?? null) && ((n.spec_code && r.spec_code && String(r.spec_code).startsWith(String(n.spec_code))) || (n.topic && String(r.topic ?? "").toLowerCase() === String(n.topic).toLowerCase())));
    return Response.json({ ...n, versions: (n.versions ?? []).length, resources: res });
  }
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase().trim();
  const rows = (await s.list("notes", { order: { col: "updated_at", asc: false }, limit: 3000 })).filter((n) => !n.deleted_at && (!q || `${n.title} ${n.body} ${n.topic ?? ""} ${(n.tags ?? []).join(" ")}`.toLowerCase().includes(q)));
  return Response.json(rows.map(lite));
}

/** POST {action: create|update|delete|restore_version|versions} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const fields = ["title", "body", "subject", "topic", "kind", "spec_code", "tags", "pinned", "links", "template", "lesson_date", "color"];
  const pick = (o: Record<string, unknown>) => Object.fromEntries(fields.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  switch (b.action) {
    case "create": { const n = await s.insert("notes", { title: "Untitled note", body: "", kind: "topic", tags: [], links: [], versions: [], ...pick(b), source: "noesis", updated_at: nowIso() }); return Response.json(n); }
    case "update": {
      const cur = await s.get("notes", b.id);
      if (!cur) return Response.json({ error: "not found" }, { status: 404 });
      const patch: Record<string, unknown> = { ...pick(b), updated_at: nowIso() };
      // keep a version when the text changes meaningfully (at most one every 5 minutes)
      const vs: Row[] = Array.isArray(cur.versions) ? cur.versions : [];
      if (b.body !== undefined && b.body !== cur.body && (!vs.length || Date.now() - Date.parse(vs[vs.length - 1].at) > 5 * 60e3)) patch.versions = [...vs, { at: nowIso(), title: cur.title, body: cur.body }].slice(-25);
      if (b.review !== undefined) patch.review_at = b.review ? cur.review_at ?? nowIso() : null;
      await s.update("notes", b.id, patch);
      return Response.json({ ok: true });
    }
    case "versions": { const n = await s.get("notes", b.id); return Response.json({ versions: (n?.versions ?? []).map((v: Row, i: number) => ({ i, at: v.at, preview: String(v.body ?? "").slice(0, 140), words: String(v.body ?? "").split(/\s+/).length })).reverse() }); }
    case "restore_version": { const n = await s.get("notes", b.id); const v = n?.versions?.[b.i]; if (!v) return Response.json({ error: "no such version" }, { status: 400 }); await s.update("notes", b.id, { body: v.body, versions: [...n!.versions, { at: nowIso(), title: n!.title, body: n!.body }].slice(-25), updated_at: nowIso() }); return Response.json({ ok: true }); }
    case "delete": await s.update("notes", b.id, { deleted_at: nowIso() }); return Response.json({ ok: true });
    case "restore": await s.update("notes", b.id, { deleted_at: null }); return Response.json({ ok: true });
    case "link": { // a resource link for the note's topic (YouTube, websites)
      const n = await s.get("notes", b.id);
      const r = await s.insert("resource_links", { title: b.title || b.url, url: b.url, subject: n?.subject ?? null, topic: n?.topic ?? null, spec_code: n?.spec_code ?? null });
      return Response.json(r);
    }
    default: return Response.json({ error: "unknown action" }, { status: 400 });
  }
}
