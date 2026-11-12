import "server-only";
import { getStore } from "./getStore";
import type { Store } from "./store";

export const ONLINE_WINDOW_MS = 45_000;

export function storeOr503(): Store | Response {
  const s = getStore();
  return s ?? Response.json({ error: "not_configured" }, { status: 503 });
}

export async function relayOnline(s: Store) {
  const r = await s.get("relay_status", "main");
  return { row: r, online: !!r?.last_heartbeat && Date.now() - Date.parse(r.last_heartbeat) < ONLINE_WINDOW_MS };
}

export const titleFrom = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= 48 ? t : `${t.slice(0, 46).replace(/\s\S*$/, "")}…`;
};
