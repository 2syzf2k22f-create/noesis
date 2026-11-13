import { NextResponse, type NextRequest } from "next/server";

// Site lock: when SITE_PASSWORD is set, every page and API needs the login cookie.
// Exceptions: the login page itself, and scheduled jobs that present CRON_SECRET.
export const COOKIE = "noesis_auth";
export async function tokenFor(password: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`noesis:${password}`));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function proxy(req: NextRequest) {
  const pw = process.env.SITE_PASSWORD;
  if (!pw) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();
  const cron = process.env.CRON_SECRET;
  if (pathname.startsWith("/api/cron/") && cron && req.headers.get("authorization") === `Bearer ${cron}`) return NextResponse.next();
  if (req.cookies.get(COOKIE)?.value === (await tokenFor(pw))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "locked" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // everything except build assets and static files
  matcher: ["/((?!_next/|engine/|pieces/|favicon|icon|apple-icon|manifest|robots|sw.js).*)"],
};
