import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { parseSpec } from "@/ui/spec";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return Response.json({ error: "not_configured" }, { status: 503 });
  const { slug } = await params;
  const p = (await s.list("pages", { eq: { slug }, isNull: ["deleted_at"], limit: 1 }))[0];
  if (!p) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ slug, title: p.title, spec: p.spec, version: p.version });
}

/** Save your own layout for a page (versioned, undoable). */
export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { slug } = await params;
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) return Response.json({ error: "bad slug" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const p = parseSpec(body.spec);
  if (!p.ok) return Response.json({ error: p.error }, { status: 400 });
  const before = (await s.list("pages", { eq: { slug }, limit: 1 }))[0] ?? null;
  const after = before
    ? await s.update("pages", before.id, { spec: p.spec, title: p.spec.title, version: (before.version ?? 1) + 1, deleted_at: null, updated_at: nowIso() })
    : await s.insert("pages", { slug, title: p.spec.title, spec: p.spec, version: 1, pinned: false, deleted_at: null, space: slug.split("--")[0] });
  await s.insert("page_versions", { page_id: after!.id, version: after!.version, spec: p.spec });
  await s.insert("action_log", { actor: "reg", tool: "update_page", table_name: "pages", row_id: after!.id, before, after, undone_at: null });
  return Response.json({ version: after!.version });
}

/** Go back to the built-in layout (the stored one is kept in history and can be restored with undo). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { slug } = await params;
  const before = (await s.list("pages", { eq: { slug }, isNull: ["deleted_at"], limit: 1 }))[0];
  if (!before) return Response.json({ ok: true });
  const after = await s.update("pages", before.id, { deleted_at: nowIso() });
  await s.insert("action_log", { actor: "reg", tool: "update_page", table_name: "pages", row_id: before.id, before, after, undone_at: null });
  return Response.json({ ok: true });
}
