import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { disconnectSpotify, spotifyStatus } from "@/core/spotify";

/** Connected / disconnected, who, and Premium or not. Never returns tokens. */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  return Response.json(await spotifyStatus(s));
}
/** POST {action: "disconnect"} */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  if (b.action !== "disconnect") return Response.json({ error: "bad action" }, { status: 400 });
  await disconnectSpotify(s);
  return Response.json({ ok: true });
}
