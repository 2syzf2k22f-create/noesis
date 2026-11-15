import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { srQueue, srReview, srSettings, srStatus, srGeo, srCharts, srUndo } from "@/core/srStore";

/** GET ?view=status | ?view=queue&area=&kind=&deck=&direction=&region=&limit= | ?view=session&id= | ?view=paused&area=&kind= */
export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const q = req.nextUrl.searchParams, view = q.get("view") ?? "status";
  if (view === "geo") return Response.json(await srGeo(s));
  if (view === "charts") return Response.json(await srCharts(s, q.get("kind") ?? undefined));
  if (view === "status") return Response.json(await srStatus(s));
  if (view === "queue") return Response.json(await srQueue(s, { area: q.get("area") ?? undefined, kind: q.get("kind") ?? undefined, deck: q.get("deck") ?? undefined, direction: q.get("direction") ?? undefined, region: q.get("region") ?? undefined, weak: q.get("weak") === "1", ids: q.get("ids") ? String(q.get("ids")).split(",") : undefined, limit: q.get("limit") ? Number(q.get("limit")) : undefined }));
  if (view === "paused") {
    const rows = (await s.list("sr_sessions", { order: { col: "created_at", asc: false }, limit: 50 })).filter((x) => x.end_reason === "paused" && (x.area ?? "") === (q.get("area") ?? "") && (x.kind ?? "") === (q.get("kind") ?? ""));
    return Response.json({ session: rows[0] ?? null });
  }
  return Response.json({ error: "bad view" }, { status: 400 });
}

/** POST {action: review|undo|session_start|session_end|session_pause|suspend|edit|settings} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "review": return Response.json(await srReview(s, b));
      case "undo": return Response.json(await srUndo(s, b.review_id));
      case "session_start": {
        const row = await s.insert("sr_sessions", { area: b.area ?? null, kind: b.kind ?? null, deck: b.deck ?? null, mode: b.mode ?? "focused", planned_count: b.planned ?? null, answered_count: 0, correct_count: 0, state: null });
        return Response.json({ id: row.id });
      }
      case "session_end": { // finished | ended_early | abandoned — answers already saved stay; unanswered items are untouched
        await s.update("sr_sessions", b.id, { ended_at: nowIso(), end_reason: b.end_reason ?? "finished", state: null, updated_at: nowIso(), ...(b.answered != null ? { answered_count: b.answered, correct_count: b.correct ?? null } : {}) });
        return Response.json({ ok: true });
      }
      case "session_pause": { await s.update("sr_sessions", b.id, { end_reason: "paused", state: { queue: b.queue ?? [], index: b.index ?? 0 }, updated_at: nowIso() }); return Response.json({ ok: true }); }
      case "session_resume": { const r = await s.get("sr_sessions", b.id); await s.update("sr_sessions", b.id, { end_reason: null, updated_at: nowIso() }); return Response.json({ state: r?.state ?? null }); }
      case "suspend": { await s.update("sr_items", b.item_id, { suspended: b.suspended !== false, updated_at: nowIso() }); return Response.json({ ok: true }); }
      case "edit": {
        const it = await s.get("sr_items", b.item_id); if (!it) throw new Error("not found");
        const payload = { ...(it.payload ?? {}), ...(b.payload ?? {}) };
        await s.update("sr_items", it.id, { payload, updated_at: nowIso() });
        if (it.kind === "flashcard") await s.update("flashcards", it.source_id, { front: payload.front, back: payload.back, updated_at: nowIso() }).catch(() => null);
        return Response.json({ ok: true });
      }
      case "reset": { // reset an item back to new (undoable via the action log)
        const it = await s.get("sr_items", b.item_id); if (!it) throw new Error("not found");
        await s.insert("action_log", { actor: "reg", tool: "sr_reset", table_name: "sr_items", row_id: it.id, before: it, after: null, undone_at: null }).catch(() => null);
        await s.update("sr_items", it.id, { state: "new", stability: null, difficulty: null, due_at: null, last_reviewed_at: null, reps: 0, lapses: 0, step: 0, leech: false, history: [] });
        return Response.json({ ok: true });
      }
      case "settings": {
        const cur = await s.get("settings", "main");
        const sr = { ...(await srSettings(s)), ...(b.settings ?? {}) };
        sr.retention = Math.min(0.95, Math.max(0.8, Number(sr.retention)));
        const data = { ...(cur?.data ?? {}), sr };
        if (cur) await s.update("settings", "main", { data, updated_at: nowIso() }); else await s.insert("settings", { id: "main", data });
        return Response.json({ settings: sr });
      }
    }
    return Response.json({ error: "bad action" }, { status: 400 });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
