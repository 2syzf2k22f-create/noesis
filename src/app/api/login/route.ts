import { COOKIE, tokenFor } from "@/proxy";

const tries = new Map<string, { n: number; at: number }>();

export async function POST(req: Request) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return Response.json({ ok: true });
  // slow down guessing: 5 wrong tries per 10 minutes per address
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";
  const t = tries.get(ip);
  if (t && Date.now() - t.at < 10 * 60e3 && t.n >= 5) return Response.json({ error: "Too many tries. Wait 10 minutes." }, { status: 429 });
  const { password } = await req.json().catch(() => ({}));
  if (password !== pw) {
    tries.set(ip, { n: (t && Date.now() - t.at < 10 * 60e3 ? t.n : 0) + 1, at: Date.now() });
    return Response.json({ error: "Wrong password." }, { status: 401 });
  }
  tries.delete(ip);
  const res = Response.json({ ok: true });
  res.headers.append("set-cookie", `${COOKIE}=${await tokenFor(pw)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`);
  return res;
}
