import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { anchorOf, weekOf } from "@/core/schoolWeek";

/** Which timetable week (A/B) it is now, from settings.data.week_a_anchor. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const st = await s.get("settings", "main").catch(() => null);
  const anchor = anchorOf(st?.data);
  return Response.json({ anchor, current: weekOf(new Date(), anchor) });
}
