import { storeOr503 } from "@/core/api";
import { runBind } from "@/core/query";
import { BindSchema } from "@/ui/spec";

/** POST { binds: Bind[] } -> results in the same order. */
export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const body = await req.json().catch(() => ({}));
  const binds = Array.isArray(body.binds) ? body.binds.slice(0, 40) : [];
  const out = await Promise.all(binds.map(async (b: unknown) => {
    const p = BindSchema.safeParse(b);
    if (!p.success) return { error: "invalid binding" };
    try { return await runBind(s, p.data, { owner: true }); } catch (e) { return { error: (e as Error).message }; }
  }));
  return Response.json(out);
}
