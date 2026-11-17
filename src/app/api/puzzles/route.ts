import { connection, type NextRequest } from "next/server";
import { storeOr503 } from "@/core/api";
import { nextPuzzle, topUpPuzzles } from "@/core/puzzles";

/** GET ?theme=&difficulty= a puzzle via the server (works where lichess.org is blocked). ?stock=1 tops up the stash. */
export async function GET(req: NextRequest) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  if (req.nextUrl.searchParams.get("stock")) return Response.json({ added: await topUpPuzzles(s, 3) });
  const p = await nextPuzzle(s, req.nextUrl.searchParams.get("theme") ?? "mix", req.nextUrl.searchParams.get("difficulty") ?? "normal");
  if (!p) return Response.json({ error: "No puzzles available: lichess can't be reached and none are saved yet. Open puzzles once on a network where lichess works and they'll be kept." }, { status: 503 });
  const count = await s.count("puzzle_cache").catch(() => 0);
  return Response.json({ ...p, stash: count });
}
