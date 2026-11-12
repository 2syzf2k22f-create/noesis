import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { agenda } from "@/core/agenda";

export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  return Response.json(await agenda(s, Math.min(60, Number(req.nextUrl.searchParams.get("days") ?? 14) || 14)));
}
