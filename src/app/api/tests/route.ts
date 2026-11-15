import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso, type Row } from "@/core/store";
import { clashes, createTest, daysUntil, generatePlan, lessonFor, syncReminders, testDetail } from "@/core/tests";

/** Upcoming tests (and past ones) with countdowns, topic counts, readiness and clash warnings. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const [tests, tt] = await Promise.all([s.list("upcoming_tests", { limit: 300 }), s.list("timetable", { limit: 500 })]);
  const live = tests.filter((t) => !t.deleted_at);
  const { specWithEvidence } = await import("@/core/spec");
  const spec = await specWithEvidence(s);
  const details = (await Promise.all(live.map((t) => testDetail(s, t.id, spec)))).filter(Boolean) as NonNullable<Awaited<ReturnType<typeof testDetail>>>[];
  const list = details.map((d) => ({ id: d.id, title: d.title, subject: d.subject, date: d.date, start_time: d.start_time, end_time: d.end_time, room: d.room, status: d.status, days: d.days, topics: d.topics.length, readiness: d.readiness, predicted_grade: d.predicted_grade, result_marks: d.result_marks, total_marks: d.total_marks, codes: d.topics.flatMap((t) => t.codes) }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.start_time).localeCompare(String(b.start_time)));
  const upcoming = list.filter((t) => t.status === "upcoming" && t.days >= 0);
  return Response.json({ upcoming, past: list.filter((t) => !(t.status === "upcoming" && t.days >= 0)).reverse(), clashes: clashes(upcoming as Row[], tt) });
}

/** POST {action, ...}: create | update | delete | duplicate | status | plan | topics | topic_confidence | result | chapter_map | lesson */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const log = (tool: string, table: string, id: string | null, before: unknown, after: unknown) => s.insert("action_log", { actor: "reg", tool, table_name: table, row_id: id, before, after, undone_at: null }).catch(() => null);
  try {
    switch (b.action) {
      case "lesson": return Response.json(await lessonFor(s, b.subject, b.date, b.time));
      case "create": {
        const r = await createTest(s, b);
        await log("create_test", "upcoming_tests", r.id, null, r);
        return Response.json(r);
      }
      case "session_start": {
        const open = (await s.list("test_sessions", { eq: { test_id: b.id, status: "active" }, limit: 5 })).find((x) => (x.topic_id ?? null) === (b.topic_id ?? null));
        const row = open ?? await s.insert("test_sessions", { test_id: b.id, topic_id: b.topic_id ?? null, order_mode: b.order_mode ?? "weakest", status: "active", covered: [], scores: {}, minutes: 0 });
        return Response.json({ id: row.id, resumed: !!open, covered: row.covered, scores: row.scores, current_topic_id: row.current_topic_id ?? null });
      }
      case "session_pause": { await s.update("test_sessions", b.session_id, { status: "paused", updated_at: nowIso() }); return Response.json({ ok: true }); }
      case "session_resume": { await s.update("test_sessions", b.session_id, { status: "active", updated_at: nowIso() }); return Response.json({ ok: true }); }
      case "update": {
        const before = await s.get("upcoming_tests", b.id); if (!before) throw new Error("not found");
        const patch: Record<string, unknown> = {};
        for (const k of ["title", "subject", "date", "start_time", "end_time", "room", "total_marks", "target_marks", "target_grade", "notes", "calculator_allowed", "format", "duration_min", "reminder_settings", "status"]) if (k in b) patch[k] = b[k];
        const after = await s.update("upcoming_tests", b.id, { ...patch, updated_at: nowIso() });
        await syncReminders(s, { ...before, ...after });
        await log("update_test", "upcoming_tests", b.id, before, after);
        return Response.json({ ok: true });
      }
      case "status": {
        const after = await s.update("upcoming_tests", b.id, { status: b.status, updated_at: nowIso() });
        await syncReminders(s, after!);
        return Response.json({ ok: true });
      }
      case "delete": {
        const t = await s.get("upcoming_tests", b.id); if (!t) throw new Error("not found");
        await s.insert("trash", { table_name: "upcoming_tests", row_id: t.id, data: t, deleted_at: nowIso() });
        const after = await s.update("upcoming_tests", t.id, { deleted_at: nowIso() });
        await syncReminders(s, after!);
        for (const p of await s.list("plan_items", { eq: { test_id: t.id }, limit: 500 })) if (!p.done) await s.remove("plan_items", p.id);
        await log("delete_record", "upcoming_tests", t.id, t, after);
        return Response.json({ ok: true });
      }
      case "duplicate": {
        const t = await s.get("upcoming_tests", b.id); if (!t) throw new Error("not found");
        const { id: _i, created_at: _c, ...rest } = t; void _i; void _c;
        const n = await s.insert("upcoming_tests", { ...rest, title: `${t.title} (copy)`, date: b.date ?? t.date, status: "upcoming", result_marks: null, result_grade: null, school_test_id: null, deleted_at: null });
        for (const tp of await s.list("upcoming_test_topics", { eq: { test_id: t.id }, limit: 200 })) { const { id: _x, created_at: _y, ...r } = tp; void _x; void _y; await s.insert("upcoming_test_topics", { ...r, test_id: n.id, result_marks: null, result_total: null }); }
        await syncReminders(s, n);
        return Response.json({ id: n.id });
      }
      case "topics": { // replace topic list
        for (const tp of await s.list("upcoming_test_topics", { eq: { test_id: b.id }, limit: 200 })) await s.remove("upcoming_test_topics", tp.id);
        for (const [i, tp] of (b.topics ?? []).entries()) await s.insert("upcoming_test_topics", { test_id: b.id, label: tp.label, chapter: tp.chapter ?? null, spec_codes: tp.spec_codes ?? [], scope_note: tp.scope_note ?? null, excluded: tp.excluded ?? null, sort_order: i + 1 });
        return Response.json({ ok: true });
      }
      case "topic_confidence": { // a topic's confidence also sets its statements' spec confidence
        const tp = await s.get("upcoming_test_topics", b.topic_id); if (!tp) throw new Error("not found");
        await s.update("upcoming_test_topics", tp.id, { confidence: b.confidence, updated_at: nowIso() });
        const t = await s.get("upcoming_tests", tp.test_id);
        for (const p of await s.list("spec_points", { eq: { subject: t!.subject }, limit: 5000 }))
          if ((tp.spec_codes ?? []).some((c: string) => p.code === c || (p.level === 4 && p.code.startsWith(c)))) await s.update("spec_points", p.id, { confidence: b.confidence, last_reviewed_at: nowIso() });
        return Response.json({ ok: true });
      }
      case "result": { // marks per topic -> school_tests row (+ the test marked done)
        const t = await s.get("upcoming_tests", b.id); if (!t) throw new Error("not found");
        const topics = await s.list("upcoming_test_topics", { eq: { test_id: t.id }, limit: 200 });
        let got = 0, of = 0;
        const per: { topic: string; got: number; of: number }[] = [];
        for (const tp of topics) { const r = b.marks?.[tp.id]; if (!r) continue; await s.update("upcoming_test_topics", tp.id, { result_marks: r.got, result_total: r.of }); got += Number(r.got); of += Number(r.of); per.push({ topic: tp.label, got: Number(r.got), of: Number(r.of) }); }
        const total = Number(b.total ?? of) || of, score = b.score != null ? Number(b.score) : got, pct = total ? Math.round((score / total) * 1000) / 10 : null;
        const st = await s.insert("school_tests", { subject: t.subject, title: t.title, date: String(t.date).slice(0, 10), score, total, pct, grade: b.grade ?? null, topics: per, notes: b.notes ?? null, spec_code: null });
        const after = await s.update("upcoming_tests", t.id, { status: "done", result_marks: score, result_grade: b.grade ?? null, school_test_id: st.id, updated_at: nowIso() });
        await syncReminders(s, after!);
        for (const m of (b.mistakes ?? []) as { what: string; topic?: string; spec_code?: string; why?: string }[]) if (m.what) await s.insert("mistakes", { subject: t.subject, topic: m.topic ?? null, spec_code: m.spec_code ?? null, what: m.what, why: m.why ?? null, source: t.title, resolved: false });
        return Response.json({ ok: true, school_test_id: st.id, pct });
      }
      case "plan": return Response.json(await generatePlan(s));
      case "reminders": { const t = await s.get("upcoming_tests", b.id); return Response.json({ created: t ? await syncReminders(s, t) : 0 }); }
      case "chapter_map": {
        const ex = (await s.list("chapter_maps", { eq: { subject: b.subject, chapter: b.chapter }, limit: 1 }))[0];
        const data = { subject: b.subject, chapter: b.chapter, label: b.label ?? null, spec_codes: b.spec_codes ?? [], scope_note: b.scope_note ?? null, updated_at: nowIso() };
        if (ex) await s.update("chapter_maps", ex.id, data); else await s.insert("chapter_maps", data);
        return Response.json({ ok: true });
      }
    }
    return Response.json({ error: "bad action" }, { status: 400 });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
void daysUntil;
