import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { WRITABLE } from "@/core/tools";

/** Download everything as one JSON file (your journal included; Microsoft tokens excluded). */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const tables = [...WRITABLE, "journal_entries", "geo_attempts", "messages", "weekly_reports", "action_log"];
  const data: Record<string, unknown[]> = {};
  for (const t of [...new Set(tables)]) data[t] = await s.list(t, { limit: 20000 }).catch(() => []);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify({ exported_at: new Date().toISOString(), tables: data }, null, 1), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="noesis-export-${day}.json"` },
  });
}
