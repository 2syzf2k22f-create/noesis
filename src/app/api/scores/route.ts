import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { weeklyScores } from "@/core/scores";

export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const w = Math.max(0, Math.min(52, Number(req.nextUrl.searchParams.get("weeksAgo") ?? 0) || 0));
  return Response.json(await weeklyScores(s, w));
}
