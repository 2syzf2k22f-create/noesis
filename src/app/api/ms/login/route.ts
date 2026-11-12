import { authUrl, msClientId, pkce } from "@/core/microsoft";

/** Start Microsoft sign-in (PKCE; the verifier is kept in a short-lived httpOnly cookie). */
export async function GET(req: Request) {
  if (!msClientId()) return Response.json({ error: "MS_CLIENT_ID isn't set in Netlify yet" }, { status: 503 });
  const origin = new URL(req.url).origin;
  const { verifier, challenge } = pkce();
  const state = crypto.randomUUID();
  const cookie = (k: string, v: string) => `${k}=${v}; Path=/api/ms; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
  const h = new Headers({ location: authUrl(origin, state, challenge) });
  h.append("set-cookie", cookie("ms_v", verifier));
  h.append("set-cookie", cookie("ms_s", state));
  return new Response(null, { status: 302, headers: h });
}
