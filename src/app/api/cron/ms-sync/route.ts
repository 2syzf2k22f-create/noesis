import { connection } from "next/server";
import { getStore } from "@/core/getStore";
import { syncMicrosoft } from "@/core/microsoft";

/** Scheduled Microsoft sync (Vercel Cron daily, plus the relay every 15 min). Needs CRON_SECRET (checked here and in proxy.ts). */
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorised" }, { status: 401 });
  const s = getStore();
  if (!s) return Response.json({ error: "no store" }, { status: 503 });
  // daily: keep 28 days of recurring reminders ahead (works even when the PC is off)
  const { ensureRecurring } = await import("@/core/recurring");
  const reminders = await ensureRecurring(s).catch((e) => `failed: ${(e as Error).message}`);
  const ms = await syncMicrosoft(s, undefined, { scheduled: true }).catch((e) => ({ error: (e as Error).message }));
  return Response.json({ reminders, ms });
}
