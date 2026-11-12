import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { msStatus, syncMicrosoft } from "@/core/microsoft";
import { nowIso } from "@/core/store";

export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  return Response.json(await msStatus(s));
}

/** POST {} = sync now; POST {arbor: url} saves the Arbor calendar link; POST {disconnect: true}. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (typeof b.arbor === "string") {
    const cur = await s.get("settings", "main");
    const data = { ...(cur?.data ?? {}), arbor_ics_url: b.arbor.trim() || null };
    if (cur) await s.update("settings", "main", { data, updated_at: nowIso() }); else await s.insert("settings", { id: "main", data });
  }
  if (b.disconnect) { if (await s.get("ms_auth", "main")) await s.remove("ms_auth", "main"); return Response.json(await msStatus(s)); }
  const result = await syncMicrosoft(s);
  return Response.json({ ...(await msStatus(s)), result });
}
