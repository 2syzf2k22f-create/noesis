import { storeOr503 } from "@/core/api";
import { finishLogin } from "@/core/spotify";

export async function GET(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const cookies = Object.fromEntries((req.headers.get("cookie") ?? "").split(/;\s*/).map((c) => [c.split("=")[0], c.slice(c.indexOf("=") + 1)]));
  const back = (q: string) => {
    const h = new Headers({ location: `/s/settings?spotify=${q}` });
    for (const k of ["sp_v", "sp_s"]) h.append("set-cookie", `${k}=; Path=/api/spotify; Max-Age=0`);
    return new Response(null, { status: 302, headers: h });
  };
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  if (!code || !cookies.sp_v || url.searchParams.get("state") !== cookies.sp_s) return back("failed");
  try { await finishLogin(s, url.origin, code, cookies.sp_v); return back("connected"); }
  catch { return back("failed"); } // no details: they could include tokens
}
