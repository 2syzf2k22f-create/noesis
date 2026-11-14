import { authorizeUrl, pkce, spotifyClientId } from "@/core/spotify";

/** Start Spotify sign-in (PKCE; verifier + state kept in short-lived httpOnly cookies). */
export async function GET(req: Request) {
  if (!spotifyClientId()) return Response.json({ error: "SPOTIFY_CLIENT_ID isn't set in Vercel yet" }, { status: 503 });
  const origin = new URL(req.url).origin;
  const { verifier, challenge } = pkce();
  const state = crypto.randomUUID();
  const cookie = (k: string, v: string) => `${k}=${v}; Path=/api/spotify; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
  const h = new Headers({ location: authorizeUrl(origin, state, challenge) });
  h.append("set-cookie", cookie("sp_v", verifier));
  h.append("set-cookie", cookie("sp_s", state));
  return new Response(null, { status: 302, headers: h });
}
