import { connection } from "next/server";
import { storeOr503 } from "@/core/api";
import { schoolAnalysis } from "@/core/schoolAnalysis";

export async function GET(req: Request) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const settings = await s.get("settings", "main").catch(() => null);
  const target = new URL(req.url).searchParams.get("target") ?? settings?.data?.target_grade ?? "A*";
  return Response.json(await schoolAnalysis(s, target));
}
