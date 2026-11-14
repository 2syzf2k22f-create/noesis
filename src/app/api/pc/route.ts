import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

/** PC commands waiting for Reg's OK (and the last few results). */
export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const jobs = await s.list("jobs", { eq: { kind: "pc" }, order: { col: "created_at", asc: false }, limit: 30 });
  return Response.json({ items: jobs.map((j) => ({ id: j.id, status: j.status, command: j.input?.command, why: j.input?.why, risk: j.input?.risk, at: j.created_at, out: j.output?.out ?? null })) });
}
