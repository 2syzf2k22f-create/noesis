import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { ics } from "@/core/tests";

/** All upcoming tests as a calendar file (with a reminder the day before). */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const tests = (await s.list("upcoming_tests", { limit: 300 })).filter((t) => t.status === "upcoming");
  return new Response(ics(tests), { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="noesis-tests.ics"' } });
}
