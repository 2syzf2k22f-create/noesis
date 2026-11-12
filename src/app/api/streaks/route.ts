import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { streaks } from "@/core/streaks";

export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  return Response.json(await streaks(s));
}
