import { storeOr503 } from "@/core/api";
import { syncChess, syncCodeforces } from "@/core/sync";

export async function POST(_req: Request, { params }: { params: Promise<{ service: string }> }) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const { service } = await params;
  try {
    if (service === "chess") return Response.json(await syncChess(s));
    if (service === "codeforces") return Response.json(await syncCodeforces(s));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
  return Response.json({ error: "unknown service" }, { status: 404 });
}
