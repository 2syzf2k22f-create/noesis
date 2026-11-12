import { storeOr503 } from "@/core/api";
import { exchangeCode, syncMicrosoft } from "@/core/microsoft";

export async function GET(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const url = new URL(req.url);
  const jar = Object.fromEntries((req.headers.get("cookie") ?? "").split(/;\s*/).map((c) => c.split("=")));
  const back = (q: string) => new Response(null, { status: 302, headers: { location: `/s/school/homework?ms=${encodeURIComponent(q)}` } });
  if (url.searchParams.get("error")) return back(`error: ${url.searchParams.get("error_description") ?? url.searchParams.get("error")}`);
  const code = url.searchParams.get("code");
  if (!code || !jar.ms_v || url.searchParams.get("state") !== jar.ms_s) return back("error: sign-in expired, try again");
  try {
    await exchangeCode(s, url.origin, code, jar.ms_v);
    await syncMicrosoft(s).catch(() => {});
    return back("connected");
  } catch (e) {
    return back(`error: ${(e as Error).message}`);
  }
}
