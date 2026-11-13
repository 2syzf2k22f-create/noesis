import { storeOr503 } from "@/core/api";
import { schoolAnalysis } from "@/core/schoolAnalysis";

// Common questions answered straight from your data: no relay, no tokens.
// Anything that doesn't clearly match goes to Apollo as normal.
const hm = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const today = () => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" })).getDay(); return d === 0 ? 7 : d; };
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const q = String((await req.json().catch(() => ({}))).text ?? "").toLowerCase().trim();
  if (q.length > 80 || /\b(why|how do|explain|help me|write|make|create|plan|should)\b/.test(q)) return Response.json({ answer: null });

  if (/^(what('?s| is)? )?(my )?(next|current) (lesson|class|period)|what (lesson|class) (is it|now|next)|timetable today|lessons today/.test(q)) {
    const t = hm();
    const ls = (await s.list("timetable", { limit: 500 })).filter((l) => Number(l.day) === today()).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    if (!ls.length) return Response.json({ answer: "No lessons in your timetable for today." });
    if (/today/.test(q)) return Response.json({ answer: ls.map((l) => `${l.start} ${l.subject}${l.room ? ` (${l.room})` : ""}`).join("\n") });
    const cur = ls.find((l) => l.start <= t && l.end > t), next = ls.find((l) => l.start > t);
    return Response.json({ answer: [cur ? `Now: ${cur.subject}${cur.room ? ` in ${cur.room}` : ""} until ${cur.end}.` : "", next ? `Next: ${next.subject} at ${next.start}${next.room ? ` in ${next.room}` : ""}.` : "No more lessons today."].filter(Boolean).join(" ") });
  }
  if (/(what|which|any) homework|homework (is )?due|what('?s| is) due|due (this week|soon|tomorrow)/.test(q)) {
    const hw = (await s.list("homework", { eq: { status: "to do" }, limit: 200 })).filter((h) => !h.deleted_at).sort((a, b) => String(a.due_at ?? "9").localeCompare(String(b.due_at ?? "9"))).slice(0, 8);
    return Response.json({ answer: hw.length ? hw.map((h) => `- ${h.title}${h.subject ? ` (${h.subject})` : ""}${h.due_at ? `, due ${when(h.due_at)}` : ""}`).join("\n") : "Nothing to do. All homework is done." });
  }
  if (/flashcards? (are )?due|cards? due|how many (flash)?cards/.test(q)) {
    const now = Date.now();
    const due = (await s.list("flashcards", { isNull: ["deleted_at"], limit: 20000 })).filter((c) => !c.due_at || Date.parse(c.due_at) <= now);
    const by = new Map<string, number>(); for (const c of due) by.set(c.deck, (by.get(c.deck) ?? 0) + 1);
    return Response.json({ answer: due.length ? `${due.length} cards due: ${[...by.entries()].map(([d, n]) => `${d} ${n}`).join(", ")}.` : "No flashcards due right now." });
  }
  if (/predicted grades?|what grades?|how am i doing (in|at) (maths|further maths|physics|economics|school)|my grades/.test(q)) {
    const a = await schoolAnalysis(s);
    const only = a.subjects.filter((x) => q.includes(x.subject.toLowerCase()));
    const list = (only.length ? only : a.subjects).map((x) => `- ${x.subject}: ${x.grade ?? "no marks yet"}${x.level != null ? ` (${x.level}%, ${x.gapToTarget ? `${x.gapToTarget} pts to A*` : "at A*"})` : ""}`);
    return Response.json({ answer: `${list.join("\n")}\nDetails: School overview › Path to A*.` });
  }
  if (/screen ?time (today|yesterday)|how much screen ?time/.test(q)) {
    const rows = await s.list("screentime_days", { order: { col: "day", asc: false }, limit: 7 });
    return Response.json({ answer: rows.length ? `${rows[0].day}: ${Math.floor(rows[0].minutes / 60)}h ${rows[0].minutes % 60}m. 7-day average ${Math.round(rows.reduce((a, r) => a + Number(r.minutes), 0) / rows.length)} min.` : "No screen time logged yet." });
  }
  return Response.json({ answer: null });
}
