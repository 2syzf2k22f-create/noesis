import { storeOr503 } from "@/core/api";
import { deepStats } from "@/core/deepstats";
import { BINDABLE } from "@/core/query";

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (!BINDABLE.has(b.table) || b.table === "journal_entries") return Response.json({ error: "not readable" }, { status: 400 });
  return Response.json(await deepStats(s, { table: b.table, field: b.field, where: b.where, days: Math.min(730, Number(b.days) || 90), better: b.better === "lower" ? "lower" : "higher", groupBy: b.groupBy }));
}
