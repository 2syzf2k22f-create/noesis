import { storeOr503 } from "@/core/api";
import { nowIso } from "@/core/store";
import { dowOf } from "@/core/tests";

/** Which lesson is on right now (timetable, Week A/B aware): {subject, start, end} or the most recent one today. */
export async function GET() {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const now = new Date();
  const date = now.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const hm = now.toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const st = await s.get("settings", "main").catch(() => null);
  const { anchorOf, weekOf } = await import("@/core/schoolWeek");
  const wk = weekOf(new Date(`${date}T12:00:00Z`), anchorOf(st?.data));
  const today = (await s.list("timetable", { limit: 500 })).filter((l) => Number(l.day) === dowOf(date) && (!l.week || l.week === wk)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const cur = today.find((l) => l.start <= hm && hm <= l.end) ?? [...today].reverse().find((l) => l.start <= hm) ?? null;
  return Response.json({ lesson: cur ? { subject: cur.subject, start: cur.start, end: cur.end, room: cur.room } : null, date });
}

/** Create the lesson note for a captured photo. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const n = await s.insert("notes", { title: `${b.subject ?? "Lesson"} lesson ${new Date().toLocaleDateString("en-GB")}`, subject: b.subject ?? null, kind: "lesson", lesson_date: new Date().toISOString().slice(0, 10), body: `![board](${b.image})\n\n_Transcribing…_`, tags: ["capture"], links: [], versions: [], source: "capture", updated_at: nowIso() });
  return Response.json({ id: n.id });
}
