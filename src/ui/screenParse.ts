// Screen Time / Digital Wellbeing screenshot text -> total and per-app minutes.
export type App = { app: string; minutes: number };

/** "4h 23m", "4 hr 23 min", "2 hrs, 15 mins", "45m", "1h" -> minutes */
export function parseDuration(s: string): number | null {
  const m = /(?:(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\b[\s,]*)?(?:(\d{1,2})\s*(?:m|min|mins|minute|minutes)\b)?/i.exec(s);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
}
const DUR = /(\d{1,2}\s*(?:h|hr|hrs|hours?)\b[\s,]*(?:\d{1,2}\s*(?:m|min|mins|minutes?)\b)?|\d{1,2}\s*(?:m|min|mins|minutes?)\b)/i;

/** Pull the total and per-app times out of OCR text. */
export function parseScreenTime(text: string) {
  const lines = text.split("\n").map((l) => l.replace(/[|©®>›]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  let total: number | null = null, average = false;
  const apps: App[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (total == null && /daily average|screen time|today|total/i.test(l)) {
      const d = DUR.exec(l) ?? DUR.exec(lines[i + 1] ?? "");
      if (d) { total = parseDuration(d[0]); average = /average/i.test(l); continue; }
    }
    const d = DUR.exec(l);
    if (!d) continue;
    const name = l.slice(0, d.index).replace(/[^\p{L}\p{N}&+.' -]/gu, "").trim();
    const mins = parseDuration(d[0]);
    if (mins == null) continue;
    if (name.length >= 2 && !/^(daily|average|total|screen|today|yesterday|week|most used|pickups|notifications|show|limit|updated)/i.test(name)) apps.push({ app: name, minutes: mins });
    else if (total == null) total = mins;
  }
  // de-duplicate apps, keep the larger reading
  const seen = new Map<string, number>();
  for (const a of apps) seen.set(a.app, Math.max(seen.get(a.app) ?? 0, a.minutes));
  const list = [...seen.entries()].map(([app, minutes]) => ({ app, minutes })).sort((a, b) => b.minutes - a.minutes).slice(0, 20);
  if (total == null && list.length) total = list.reduce((x, a) => x + a.minutes, 0);
  return { total, average, apps: list };
}

