import { envReport } from "@/core/getStore";
import { connection } from "next/server";
import { relayOnline, storeOr503 } from "@/core/api";

const DAY = 864e5;

export async function GET() {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return Response.json({ configured: false, env: envReport() });
  const { row, online } = await relayOnline(s);
  const queued = await s.count("jobs", { eq: { status: "queued" } });
  const now = Date.now();
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const usage = await s.list("usage_log", { order: { col: "created_at", asc: false }, limit: 1000 });
  const sum = (since: number | string) => usage
    .filter((u) => u.created_at >= (typeof since === "string" ? since : new Date(since).toISOString()))
    .reduce((a, u) => a + (u.tokens_in ?? 0) + (u.tokens_out ?? 0), 0);
  const limited = (await s.list("jobs", { eq: { status: "rate_limited" }, order: { col: "retry_at", asc: true }, limit: 1 }))[0];
  return Response.json({
    configured: true, store: s.kind,
    relay: { online, lastHeartbeat: row?.last_heartbeat ?? null, busy: !!row?.info?.busy, host: row?.info?.host ?? null },
    queued, backAt: limited?.retry_at ?? null,
    plan: row?.info?.plan ?? null, planAt: row?.info?.plan_at ?? null,
    tokens: { today: sum(startOfDay), week: sum(now - 7 * DAY), last: usage[0] ? usage[0].tokens_in + usage[0].tokens_out : null },
  });
}
