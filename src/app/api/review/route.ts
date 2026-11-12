import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { dueCards, review, type Grade } from "@/core/srs";

export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const sp = req.nextUrl.searchParams;
  return Response.json(await dueCards(s, sp.get("deck"), 40, sp.get("decks")?.split(",").filter(Boolean)));
}

export async function POST(req: Request) {
  const s = storeOr503();
  if (s instanceof Response) return s;
  const b = await req.json().catch(() => ({}));
  const g = Number(b.grade);
  if (typeof b.id !== "string" || ![0, 1, 2, 3].includes(g)) return Response.json({ error: "bad request" }, { status: 400 });
  const card = await review(s, b.id, g as Grade);
  return card ? Response.json(card) : Response.json({ error: "not found" }, { status: 404 });
}
