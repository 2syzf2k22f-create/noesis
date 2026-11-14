import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { disconnectSpotify, spotifyStatus } from "@/core/spotify";
import { nowIso } from "@/core/store";

/** Connected / disconnected, who, and Premium or not. Never returns tokens. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const st = await s.get("settings", "main").catch(() => null);
  return Response.json({ ...(await spotifyStatus(s)), service: st?.data?.music_service === "spotify" ? "spotify" : "apple_music" });
}
/** POST {action: "disconnect"} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (b.action === "service" && (b.service === "apple_music" || b.service === "spotify")) {
    const cur = await s.get("settings", "main");
    const data = { ...(cur?.data ?? {}), music_service: b.service };
    if (cur) await s.update("settings", "main", { data, updated_at: nowIso() }); else await s.insert("settings", { id: "main", data });
    return Response.json({ ok: true });
  }
  if (b.action !== "disconnect") return Response.json({ error: "bad action" }, { status: 400 });
  await disconnectSpotify(s);
  return Response.json({ ok: true });
}
