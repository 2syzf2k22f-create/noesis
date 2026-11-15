import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { nowIso, type Row } from "@/core/store";
import { deloadWeek, exerciseHistory, itemsOf, minutesFor, musclesOf, MUSCLES, parseLines, toText, type Item } from "@/core/fitness";
import { anchorOf, inWeek, weekOf } from "@/core/schoolWeek";

const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const norm = (s: string) => s.toLowerCase().replace(/^(gym|workout)\s*[-:–]\s*/, "").replace(/[^a-z0-9]+/g, " ").trim();
/** A timetable row belongs to a routine when its subject (minus "Gym - ") appears in the routine's name, e.g. "Upper A". */
const matches = (subject: string, routine: string) => { const s = norm(subject); return s.length >= 3 && (norm(routine).includes(s) || s === norm(routine)); };

/** Everything the Routines page shows, computed from routines, sets, workouts and timetable. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const [routines, sets, workouts, tt, settings, facts] = await Promise.all([
    s.list("routines", { limit: 200 }), s.list("sets", { order: { col: "created_at", asc: false }, limit: 5000 }),
    s.list("workouts", { order: { col: "created_at", asc: false }, limit: 1000 }), s.list("timetable", { limit: 500 }),
    s.get("settings", "main").catch(() => null), s.list("profile_facts", { limit: 100 }).catch(() => [] as Row[]),
  ]);
  const wk = weekOf(new Date(), anchorOf(settings?.data));
  const live = routines.filter((r) => !r.deleted_at);
  const now = Date.now(), weekAgo = now - 7 * 864e5;
  const dow = (new Date().getDay() + 6) % 7 + 1;
  const out = live.map((r) => {
    const items = itemsOf(r);
    const schedule = tt.filter((t) => t.subject && matches(t.subject, r.name) && inWeek(t, wk)).map((t) => ({ id: t.id, day: Number(t.day), start: t.start, end: t.end, week: t.week ?? null })).sort((a, b) => a.day - b.day || String(a.start).localeCompare(String(b.start)));
    const muscles = [...new Set(items.flatMap((i) => (i.note ? [] : musclesOf(i.name))))];
    return {
      id: r.id, name: r.name, split: r.split ?? r.day ?? "other", position: r.position ?? null, schedule, muscles,
      total_sets: items.reduce((a, i) => a + (i.note ? 0 : i.sets ?? 0), 0), minutes: minutesFor(items),
      items: items.map((i) => ({ ...i, muscles: i.note ? [] : musclesOf(i.name), history: i.note ? null : exerciseHistory(sets, i.name, i.reps) })),
      last_done: workouts.find((w) => w.routine === r.name)?.created_at ?? null,
    };
  });
  // next up: the next scheduled session from now (today later, then the coming days)
  const hm = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  const slots = out.flatMap((r) => r.schedule.map((sc) => ({ routine: r.id, name: r.name, ...sc, inDays: (sc.day - dow + 7) % 7 + (sc.day === dow && sc.start < hm ? 7 : 0) })));
  const next = slots.sort((a, b) => a.inDays - b.inDays || String(a.start).localeCompare(String(b.start)))[0] ?? null;
  // weekly volume per muscle group (kg × reps, last 7 days), with a target in sets
  const recent = sets.filter((x) => Date.parse(x.created_at) >= weekAgo);
  const vol = Object.fromEntries(MUSCLES.map((m) => [m, { volume: 0, sets: 0 }]));
  for (const x of recent) for (const m of musclesOf(String(x.exercise ?? ""))) { vol[m].volume += Number(x.weight_kg ?? 0) * Number(x.reps ?? 0); vol[m].sets += 1; }
  const focus = String(facts.find((f) => /focus|goal/i.test(f.key))?.value ?? "").toLowerCase();
  const target = (m: string) => (focus.includes(m === "arms" ? "arm" : m) ? 14 : 10); // weekly hard sets per muscle
  // sessions: from workouts (or grouped sets for older logs)
  const sessions = workouts.filter((w) => !w.deleted_at).slice(0, 12).map((w) => {
    const ws = sets.filter((x) => x.workout_id === w.id);
    return { id: w.id, at: w.created_at, routine: w.routine, sets: ws.length, volume: Math.round(Number(w.volume ?? ws.reduce((a, x) => a + Number(x.weight_kg ?? 0) * Number(x.reps ?? 0), 0))), minutes: w.duration_min ?? null };
  });
  // PRs for exercises in the routines
  const names = [...new Set(out.flatMap((r) => r.items.filter((i) => !i.note).map((i) => i.name)))];
  const prs = names.map((n) => ({ exercise: n, ...exerciseHistory(sets, n) })).filter((p) => p.best_set && p.best_set.weight_kg > 0).sort((a, b) => (b.best_e1rm ?? 0) - (a.best_e1rm ?? 0)).slice(0, 10)
    .map((p) => ({ exercise: p.exercise, weight_kg: p.best_set!.weight_kg, reps: p.best_set!.reps, e1rm: p.best_e1rm, at: p.best_set!.at }));
  const thisWeek = workouts.filter((w) => !w.deleted_at && Date.parse(w.created_at) >= weekAgo);
  return Response.json({
    week: wk, day_names: DAY, routines: out.sort((a, b) => (a.schedule[0]?.day ?? 9) - (b.schedule[0]?.day ?? 9) || (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name)),
    next, deload: deloadWeek(workouts),
    stats: { routines: out.length, sessions_week: thisWeek.length, last_trained: workouts.find((w) => !w.deleted_at)?.created_at ?? sets[0]?.created_at ?? null, volume_week: Math.round(recent.reduce((a, x) => a + Number(x.weight_kg ?? 0) * Number(x.reps ?? 0), 0)) },
    muscle_volume: MUSCLES.map((m) => ({ muscle: m, volume: Math.round(vol[m].volume), sets: vol[m].sets, target_sets: target(m) })),
    sessions, prs, focus: focus || null,
  });
}

/** POST {action, ...}: save | duplicate | delete | schedule | start | log_set | finish */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const log = (tool: string, table: string, id: string | null, before: Row | null, after: unknown) => s.insert("action_log", { actor: "reg", tool, table_name: table, row_id: id, before, after, undone_at: null }).catch(() => null);
  try {
    switch (b.action) {
      case "save": {
        const items: Item[] = Array.isArray(b.items) ? b.items : typeof b.text === "string" ? parseLines(b.text) : [];
        const clean = items.filter((i) => i?.name?.trim()).map((i) => (i.note ? { name: i.name.trim(), note: true } : { name: i.name.trim(), sets: Math.max(1, Math.min(20, Number(i.sets) || 3)), reps: String(i.reps ?? "8-12").slice(0, 30), ...(i.rest ? { rest: Number(i.rest) } : {}), ...(i.notes ? { notes: String(i.notes).slice(0, 200) } : {}) }));
        const data = { name: String(b.name ?? "").trim().slice(0, 120) || "New routine", split: b.split ?? "other", day: b.split ?? "other", items: clean, exercises: toText(clean), updated_at: nowIso() };
        // new exercise names join the exercises table (for autocomplete)
        const known = new Set((await s.list("exercises", { limit: 2000 })).map((e) => String(e.name).toLowerCase()));
        for (const i of clean) if (!i.note && !known.has(i.name.toLowerCase())) await s.insert("exercises", { name: i.name, routine: data.name }).catch(() => null);
        if (b.id) { const before = await s.get("routines", b.id); const after = await s.update("routines", b.id, data); await log("update_routine", "routines", b.id, before, after); return Response.json({ id: b.id }); }
        const row = await s.insert("routines", { ...data, deleted_at: null }); await log("create_routine", "routines", row.id, null, row);
        return Response.json({ id: row.id });
      }
      case "duplicate": {
        const r = await s.get("routines", b.id); if (!r) throw new Error("not found");
        const { id: _id, created_at: _c, ...rest } = r; void _id; void _c;
        const row = await s.insert("routines", { ...rest, name: `${r.name} (copy)`, deleted_at: null, updated_at: nowIso() });
        return Response.json({ id: row.id });
      }
      case "delete": {
        const r = await s.get("routines", b.id); if (!r) throw new Error("not found");
        await s.insert("trash", { table_name: "routines", row_id: r.id, data: r, deleted_at: nowIso() });
        const after = await s.update("routines", r.id, { deleted_at: nowIso() }); await log("delete_record", "routines", r.id, r, after);
        return Response.json({ ok: true });
      }
      case "schedule": { // replace this routine's timetable slots: [{day, start, end?, week?}]
        const r = await s.get("routines", b.id); if (!r) throw new Error("not found");
        const label = `Gym - ${String(r.name).replace(/^day \d+\s*[-–]\s*/i, "").replace(/\s*[(+].*$/, "").trim()}`;
        for (const t of await s.list("timetable", { limit: 500 })) if (t.subject && matches(t.subject, r.name)) await s.remove("timetable", t.id);
        for (const sl of (b.slots ?? []) as { day: number; start: string; end?: string; week?: string | null }[]) {
          const [h, m] = sl.start.split(":").map(Number), end = sl.end ?? `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
          await s.insert("timetable", { day: sl.day, start: sl.start, end, subject: label, week: sl.week ?? null, source: "routines" });
        }
        return Response.json({ ok: true, label });
      }
      case "start": { const w = await s.insert("workouts", { routine: b.routine, notes: null, deleted_at: null }); return Response.json({ id: w.id, at: w.created_at }); }
      case "log_set": {
        const w = Number(b.weight_kg ?? 0), r = Number(b.reps ?? 0);
        const row = await s.insert("sets", { workout_id: b.workout_id ?? null, routine: b.routine ?? null, exercise: String(b.exercise ?? "").slice(0, 120), weight_kg: w, reps: r, volume: w * r });
        return Response.json({ id: row.id });
      }
      case "finish": {
        const ws = (await s.list("sets", { eq: { workout_id: b.id }, limit: 500 }));
        const volume = ws.reduce((a, x) => a + Number(x.weight_kg ?? 0) * Number(x.reps ?? 0), 0);
        const w = await s.get("workouts", b.id);
        const minutes = w ? Math.max(1, Math.round((Date.now() - Date.parse(w.created_at)) / 60000)) : null;
        if (!ws.length) { await s.remove("workouts", b.id); return Response.json({ ok: true, empty: true }); }
        await s.update("workouts", b.id, { volume, duration_min: minutes, finished_at: nowIso(), notes: b.notes ?? null });
        return Response.json({ ok: true, volume, minutes, sets: ws.length });
      }
    }
    return Response.json({ error: "bad action" }, { status: 400 });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
