import { storeOr503 } from "@/core/api";
import { rollback, undo } from "@/core/tools";

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const body = await req.json().catch(() => ({}));
  const ctx = { store: s, actor: "reg" };
  return Response.json(typeof body.actionId === "string" ? await rollback(ctx, body.actionId) : await undo(ctx));
}
