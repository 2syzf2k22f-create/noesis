// Phone notifications through ntfy (free, no account, no keys): Reg installs the ntfy app and subscribes
// to his private topic (Settings › Phone notifications). Inbox items are pushed when they become due.
import { nowIso, type Row, type Store } from "./store";

export async function pushSettings(store: Store) {
  const d = (await store.get("settings", "main").catch(() => null))?.data ?? {};
  return { topic: (d.ntfy_topic as string | undefined) ?? null, on: d.push_on !== false && !!d.ntfy_topic, server: (d.ntfy_server as string | undefined) ?? "https://ntfy.sh", quiet: (d.push_quiet as string | undefined) ?? "22:30-07:00" };
}
const inQuiet = (q: string) => {
  const m = /^(\d\d):(\d\d)-(\d\d):(\d\d)$/.exec(q); if (!m) return false;
  const now = new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" });
  const a = `${m[1]}:${m[2]}`, b = `${m[3]}:${m[4]}`;
  return a < b ? now >= a && now < b : now >= a || now < b;
};
export async function sendPush(store: Store, title: string, body: string, link?: string | null, priority = 3) {
  const p = await pushSettings(store);
  if (!p.on || !p.topic) return { sent: false, why: "phone notifications are off" };
  const r = await fetch(`${p.server.replace(/\/$/, "")}/${encodeURIComponent(p.topic)}`, {
    method: "POST", body: body.slice(0, 3500) || " ",
    headers: { Title: title.replace(/[^\x20-\x7e]/g, "").slice(0, 200) || "NOESIS", Priority: String(priority), Tags: "bell", ...(link ? { Click: link } : {}) },
  });
  return { sent: r.ok, status: r.status };
}
/** Push inbox items that have become due and haven't been pushed (quiet hours wait until morning). */
export async function pushDue(store: Store) {
  const p = await pushSettings(store);
  if (!p.on || inQuiet(p.quiet)) return 0;
  const site = process.env.NOESIS_SITE_URL ?? "";
  const rows = (await store.list("inbox_items", { order: { col: "created_at", asc: false }, limit: 300 })).filter((r: Row) => !r.pushed_at && !r.read_at && !r.deleted_at && (!r.deliver_at || Date.parse(r.deliver_at) <= Date.now()) && Date.now() - Date.parse(r.deliver_at ?? r.created_at) < 6 * 3600e3);
  let n = 0;
  for (const r of rows.slice(0, 10)) {
    await store.update("inbox_items", r.id, { pushed_at: nowIso() });
    const ok = await sendPush(store, r.title ?? "NOESIS", r.body ?? "", r.link && site ? `${site}${r.link}` : null).catch(() => ({ sent: false }));
    if (ok.sent) n++;
  }
  return n;
}
