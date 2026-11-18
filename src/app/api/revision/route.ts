import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { candidates, decideProposal, generateRevision, rebalance, revisionHelpers, revisionSettings, revisionWeek, whatNow } from "@/core/revision";

/** GET ?from=YYYY-MM-DD (Monday) week view | ?view=ics calendar file | ?view=suggest what to revise next. */
export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const view = req.nextUrl.searchParams.get("view");
  if (view === "now") return Response.json(await whatNow(s, Number(req.nextUrl.searchParams.get("minutes") ?? 30)));
  if (view === "suggest") return Response.json((await candidates(s, await revisionSettings(s))).slice(0, 15));
  if (view === "ics") {
    const rows = (await s.list("plan_items", { limit: 3000 })).filter((p) => p.start_time && String(p.date) >= revisionHelpers.addDays(revisionHelpers.today(), -7) && p.status !== "missed");
    const { ukTime } = await import("@/core/tests");
    const z = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NOESIS//Revision//EN", ...rows.flatMap((p) => { const a = ukTime(String(p.date).slice(0, 10), p.start_time), b = p.end_time ? ukTime(String(p.date).slice(0, 10), p.end_time) : new Date(a.getTime() + Number(p.minutes ?? 45) * 60000); return ["BEGIN:VEVENT", `UID:${p.id}@noesis`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(a)}`, `DTEND:${z(b)}`, `SUMMARY:${(p.subject ? `${p.subject}: ` : "") + p.topic} (${p.method ?? "revise"})`.replace(/[,;]/g, " "), `DESCRIPTION:${String(p.reason ?? "").replace(/[,;\n]/g, " ")}`, "END:VEVENT"]; }), "END:VCALENDAR"].join("\r\n");
    return new Response(ics, { headers: { "content-type": "text/calendar", "content-disposition": "attachment; filename=revision.ics" } });
  }
  let from = req.nextUrl.searchParams.get("from") ?? revisionHelpers.today();
  const d = new Date(`${from}T12:00:00Z`); from = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
  // keep the plan honest each time it's opened (at most every 20 minutes)
  const st = (await s.get("settings", "main").catch(() => null))?.data ?? {};
  if (!st.revision_rebalanced_at || Date.now() - Date.parse(st.revision_rebalanced_at) > 20 * 60e3) await rebalance(s).catch(() => null);
  return Response.json(await revisionWeek(s, from));
}

/** POST {action: generate|rebalance|add|update|delete|settings|clear} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  try {
    switch (b.action) {
      case "generate": return Response.json(await generateRevision(s, b.settings ?? {}, { from: b.from, replace: b.replace }));
      case "rebalance": return Response.json(await rebalance(s));
      case "proposal": return Response.json(await decideProposal(s, !!b.accept));
      case "propose": return Response.json(await generateRevision(s, b.settings ?? { days_ahead: 7 }, { from: revisionHelpers.addDays(revisionHelpers.today(), 1), proposed: true }));
      case "add": {
        const m = Number(b.minutes ?? 45);
        const end = b.start_time ? revisionHelpers.hm(revisionHelpers.mins(b.start_time) + m) : null;
        const row = await s.insert("plan_items", { date: b.date, start_time: b.start_time ?? null, end_time: end, minutes: m, subject: b.subject ?? null, topic: b.topic || b.subject || "Revision", spec_code: b.spec_code ?? null, method: b.method ?? "questions", kind: b.method === "lesson" ? "learn" : "practice", source: b.source ?? "manual", status: "planned", done: false, locked: !!b.locked, reason: b.reason ?? "added by you", notes: b.notes ?? null });
        return Response.json(row);
      }
      case "update": {
        const patch: Record<string, unknown> = { updated_at: nowIso() };
        for (const k of ["date", "start_time", "minutes", "subject", "topic", "spec_code", "method", "status", "locked", "notes", "done_minutes"]) if (b[k] !== undefined) patch[k] = b[k];
        if (patch.status) patch.done = patch.status === "done";
        if (b.start_time || b.minutes) { const cur = await s.get("plan_items", b.id); const st = String(b.start_time ?? cur?.start_time ?? ""); if (st) patch.end_time = revisionHelpers.hm(revisionHelpers.mins(st) + Number(b.minutes ?? cur?.minutes ?? 45)); }
        if (b.date || b.start_time) patch.reason = "moved by you";
        await s.update("plan_items", b.id, patch);
        if (patch.status === "done" && b.log !== false) { const p = await s.get("plan_items", b.id); if (p?.subject) await s.insert("study_sessions", { subject: p.subject, topic: p.topic, label: `plan: ${p.method ?? "revise"}`, minutes: Number(b.done_minutes ?? p.minutes ?? 45), spec_code: p.spec_code ?? null }); }
        return Response.json({ ok: true });
      }
      case "delete": await s.remove("plan_items", b.id); return Response.json({ ok: true });
      case "clear": { let n = 0; for (const p of await s.list("plan_items", { limit: 3000 })) if (p.status === "planned" && !p.locked && String(p.date) >= revisionHelpers.today() && (b.all || p.source === "generated")) { await s.remove("plan_items", p.id); n++; } return Response.json({ removed: n }); }
      case "settings": { const st = await s.get("settings", "main"); await s.update("settings", "main", { data: { ...(st?.data ?? {}), revision: { ...(await revisionSettings(s)), ...(b.settings ?? {}) } } }); return Response.json({ ok: true }); }
      default: return Response.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
