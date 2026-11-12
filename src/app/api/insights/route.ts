import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { insights, scoreHistory } from "@/core/insights";

export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  if (req.nextUrl.searchParams.get("history")) return Response.json(await scoreHistory(s, 8));
  return Response.json(await insights(s));
}
