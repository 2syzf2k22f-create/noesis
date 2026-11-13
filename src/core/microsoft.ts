// Microsoft 365 (school account) via Microsoft Graph, read-only:
// Teams assignments -> homework, Outlook calendar -> events (+ lessons -> timetable),
// Outlook inbox -> inbox_items, OneNote pages -> notes. Optional Arbor/iCal feed -> lessons.
// Sign-in is a public-client (PKCE) app registration: no client secret is needed or stored.
// Relative imports only: also bundled into the Netlify scheduled function.
import { createHash } from "node:crypto";
import { nowIso, type Row, type Store } from "./store";

export const MS_SCOPES = "offline_access User.Read Calendars.Read Mail.Read Notes.Read EduAssignments.ReadBasic EduRoster.ReadBasic";
const TENANT = () => process.env.MS_TENANT || "organizations";
export const msClientId = () => process.env.MS_CLIENT_ID?.trim() || "";
export const msRedirect = (origin: string) => `${process.env.MS_REDIRECT_ORIGIN?.trim() || origin}/api/ms/callback`;
const AUTH = () => `https://login.microsoftonline.com/${TENANT()}/oauth2/v2.0`;
const G = "https://graph.microsoft.com/v1.0";

export function pkce() {
  const verifier = createHash("sha256").update(String(Math.random()) + Date.now() + Math.random()).digest("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
export function authUrl(origin: string, state: string, challenge: string) {
  const q = new URLSearchParams({
    client_id: msClientId(), response_type: "code", redirect_uri: msRedirect(origin), response_mode: "query",
    scope: MS_SCOPES, state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return `${AUTH()}/authorize?${q}`;
}

/** Microsoft has outages: retry network errors, 429 and 5xx a few times (honouring Retry-After), quickly enough to fit a 30 s scheduled run. */
export class MsOutage extends Error { outage = true; }
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function msFetch(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
      if (r.status !== 429 && r.status < 500) return r;
      last = new MsOutage(`Microsoft answered ${r.status}`);
      const ra = Number(r.headers.get("retry-after"));
      await wait(Math.min(5000, Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * 2 ** i));
    } catch (e) {
      last = new MsOutage(`Couldn't reach Microsoft (${(e as Error).name === "TimeoutError" ? "timed out" : (e as Error).message})`);
      await wait(800 * 2 ** i);
    }
  }
  throw last;
}

async function tokenRequest(body: Record<string, string>) {
  const r = await msFetch(`${AUTH()}/token`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: msClientId(), scope: MS_SCOPES, ...body }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description?.split("\n")[0] ?? j.error ?? `token error ${r.status}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function exchangeCode(store: Store, origin: string, code: string, verifier: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: msRedirect(origin), code_verifier: verifier });
  const me = await fetch(`${G}/me`, { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  await saveAuth(store, { account: me.userPrincipalName ?? me.mail ?? null, refresh_token: t.refresh_token, access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in - 120) * 1000).toISOString(), scopes: MS_SCOPES });
  return me.userPrincipalName ?? "connected";
}

async function saveAuth(store: Store, patch: Row | Partial<Row>) {
  const cur = await store.get("ms_auth", "main");
  if (cur) await store.update("ms_auth", "main", { ...patch, updated_at: nowIso() });
  else await store.insert("ms_auth", { id: "main", ...patch });
}

async function accessToken(store: Store) {
  const a = await store.get("ms_auth", "main");
  if (!a?.refresh_token) return null;
  if (a.access_token && a.expires_at && Date.parse(a.expires_at) > Date.now()) return a.access_token as string;
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: a.refresh_token });
  await saveAuth(store, { access_token: t.access_token, refresh_token: t.refresh_token ?? a.refresh_token, expires_at: new Date(Date.now() + (t.expires_in - 120) * 1000).toISOString() });
  return t.access_token;
}

/** Stable uuid from an external id, so re-syncing updates the same row. */
const uid = (s: string) => { const h = createHash("sha1").update(s).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const strip = (html: string) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();
const SUBJECTS: [RegExp, string][] = [[/further\s*math|f\.?\s*maths|\bfm\b/i, "Further Maths"], [/math/i, "Maths"], [/physic/i, "Physics"], [/econ/i, "Economics"], [/chem/i, "Chemistry"], [/bio/i, "Biology"], [/comput/i, "Computer Science"], [/english/i, "English"], [/french/i, "French"], [/spanish/i, "Spanish"], [/mandarin|chinese/i, "Mandarin"], [/tutor|form/i, "Tutor"], [/epq/i, "EPQ"]];
export const subjectOf = (...s: (string | undefined | null)[]) => { const t = s.filter(Boolean).join(" "); return SUBJECTS.find(([r]) => r.test(t))?.[1] ?? null; };

async function graph<T = Row>(token: string, path: string): Promise<T> {
  const r = await msFetch(path.startsWith("http") ? path : `${G}${path}`, { headers: { authorization: `Bearer ${token}`, prefer: 'outlook.timezone="Europe/London"' } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`${path.split("?")[0]}: ${j.error?.message ?? r.status}`); }
  return r.json();
}
async function all<T = Row>(token: string, path: string, max = 500): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  while (next && out.length < max) { const j: { value: T[]; "@odata.nextLink"?: string } = await graph(token, next); out.push(...j.value); next = j["@odata.nextLink"]; }
  return out;
}
async function upsert(store: Store, table: string, ext: string, row: Row | Partial<Row>, keep?: (old: Row) => Partial<Row>) {
  const id = uid(`${table}:${ext}`);
  const old = await store.get(table, id);
  if (old) { await store.update(table, id, { ...row, ...(keep ? keep(old) : {}), updated_at: nowIso() }); return "updated"; }
  await store.insert(table, { id, external_id: ext, ...row });
  return "added";
}

/* ---------- Teams assignments -> homework ---------- */
async function syncAssignments(store: Store, token: string) {
  const classes = await all(token, "/education/me/classes?$select=id,displayName").catch(() => [] as Row[]);
  const cname = new Map(classes.map((c) => [c.id, c.displayName]));
  const list = await all(token, "/education/me/assignments?$expand=submissions", 400);
  let added = 0, updated = 0;
  for (const a of list) {
    if (a.status === "draft") continue;
    const sub = a.submissions?.[0];
    const handedIn = sub && ["submitted", "returned"].includes(sub.status);
    const klass = cname.get(a.classId) ?? null;
    const grade = sub?.outcomes?.find?.((o: Row) => o.points)?.points?.points;
    const res = await upsert(store, "homework", `teams:${a.id}`, {
      title: a.displayName, subject: subjectOf(klass, a.displayName), class_name: klass, due_at: a.dueDateTime ?? null,
      link: a.webUrl ?? null, source: "teams", points: a.grading?.maxPoints ?? null, grade: grade != null ? String(grade) : null,
      instructions: a.instructions?.content ? strip(a.instructions.content).slice(0, 4000) : null, deleted_at: null,
      status: handedIn ? "done" : "to do",
    }, (old) => (old.status === "done" && !handedIn ? { status: "done" } : {}));
    if (res === "added") { added++; await store.insert("inbox_items", { source: "teams", title: `New assignment: ${a.displayName}`, body: klass, link: a.webUrl ?? null, due_at: a.dueDateTime ?? null }); }
    else updated++;
  }
  return { assignments: list.length, added, updated };
}

/* ---------- Outlook calendar -> events, lessons -> timetable ---------- */
type Ev = { ext: string; title: string; start: Date; end: Date; location: string | null; recurring: boolean; allDay: boolean; source: string };
const isLesson = (e: Ev) => !e.allDay && e.recurring && e.end.getTime() - e.start.getTime() <= 3 * 3600e3 && (!!subjectOf(e.title) || /lesson|period|p\d\b|tutor|registration|study/i.test(e.title));
async function storeEvents(store: Store, evs: Ev[]) {
  let added = 0;
  for (const e of evs) {
    const lesson = isLesson(e);
    const r = await upsert(store, "events", e.ext, { title: e.title, kind: lesson ? "lesson" : /exam|mock|assessment/i.test(e.title) ? "exam" : /deadline|due/i.test(e.title) ? "deadline" : "event", at: e.start.toISOString(), end_at: e.end.toISOString(), location: e.location, subject: subjectOf(e.title), source: e.source, deleted_at: null });
    if (r === "added") added++;
  }
  // Rebuild the synced part of the timetable from the next two weeks of lessons (A/B weeks if they differ).
  const lessons = evs.filter(isLesson);
  if (lessons.length) {
    const hm = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
    const dayOf = (d: Date) => { const w = new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" })).getDay(); return w === 0 ? 7 : w; };
    const weekStart = (d: Date) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); x.setUTCDate(x.getUTCDate() - (dayOf(d) - 1)); return x.getTime(); };
    const first = Math.min(...lessons.map((l) => weekStart(l.start)));
    const key = (l: Ev) => `${dayOf(l.start)}|${hm(l.start)}|${l.title}`;
    const wk = (l: Ev) => Math.round((weekStart(l.start) - first) / (7 * 864e5));
    const w0 = new Set(lessons.filter((l) => wk(l) === 0).map(key)), w1 = new Set(lessons.filter((l) => wk(l) === 1).map(key));
    const twoWeek = w1.size > 0 && [...w0].some((k) => !w1.has(k));
    for (const old of await store.list("timetable", { eq: { source: "outlook" }, limit: 1000 })) await store.remove("timetable", old.id);
    const seen = new Set<string>();
    for (const l of lessons.filter((x) => wk(x) <= (twoWeek ? 1 : 0))) {
      const k = `${key(l)}|${twoWeek ? wk(l) : ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await store.insert("timetable", { day: dayOf(l.start), start: hm(l.start), end: hm(l.end), subject: subjectOf(l.title) ?? l.title, room: l.location, week: twoWeek ? (wk(l) === 0 ? "A" : "B") : null, source: "outlook" });
    }
  }
  return { events: evs.length, added, lessons: lessons.length };
}
async function syncCalendar(store: Store, token: string) {
  const from = new Date(Date.now() - 864e5).toISOString(), to = new Date(Date.now() + 60 * 864e5).toISOString();
  const raw = await all(token, `/me/calendarView?startDateTime=${from}&endDateTime=${to}&$top=200&$select=id,subject,start,end,location,isAllDay,type,seriesMasterId,isCancelled`, 1500);
  const evs: Ev[] = raw.filter((e) => !e.isCancelled).map((e) => ({
    ext: `outlook:${e.id}`, title: e.subject || "(no title)", start: new Date(`${e.start.dateTime}${/Z|[+-]\d\d:/.test(e.start.dateTime) ? "" : "Z"}`), end: new Date(`${e.end.dateTime}${/Z|[+-]\d\d:/.test(e.end.dateTime) ? "" : "Z"}`),
    location: e.location?.displayName || null, recurring: !!e.seriesMasterId || e.type === "occurrence", allDay: !!e.isAllDay, source: "outlook",
  }));
  // calendarView with Europe/London preference returns local times without offset: convert
  for (const e of evs) { e.start = londonToUtc(e.start); e.end = londonToUtc(e.end); }
  return storeEvents(store, evs);
}
/** A wall-clock London time that was parsed as UTC -> the real instant. */
function londonToUtc(d: Date) {
  const asLondon = new Date(d.toLocaleString("en-US", { timeZone: "Europe/London" }));
  const asUtc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(d.getTime() - (asLondon.getTime() - asUtc.getTime()));
}

/* ---------- Arbor (or any) iCal feed ---------- */
export async function syncIcs(store: Store, url: string) {
  const text = await fetch(url.replace(/^webcal:/, "https:")).then((r) => { if (!r.ok) throw new Error(`calendar feed answered ${r.status}`); return r.text(); });
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const evs: Ev[] = [];
  const now = Date.now(), until = now + 60 * 864e5;
  for (const block of unfolded.split("BEGIN:VEVENT").slice(1)) {
    const get = (k: string) => new RegExp(`^${k}(;[^:]*)?:(.*)$`, "m").exec(block);
    const dt = (k: string) => {
      const m = get(k); if (!m) return null;
      const v = m[2].trim(), tz = /TZID=([^;:]+)/.exec(m[1] ?? "")?.[1];
      const p = /^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})?)?(Z)?$/.exec(v); if (!p) return null;
      const d = new Date(Date.UTC(+p[1], +p[2] - 1, +p[3], +(p[5] ?? 0), +(p[6] ?? 0), +(p[7] ?? 0)));
      return { d: p[8] || !tz && !p[4] ? d : londonToUtc(d), allDay: !p[4] };
    };
    const s = dt("DTSTART"), e = dt("DTEND");
    if (!s) continue;
    const end = e?.d ?? new Date(s.d.getTime() + 3600e3);
    const title = (get("SUMMARY")?.[2] ?? "(no title)").replace(/\\,/g, ",").replace(/\\n/g, " ").trim();
    const loc = get("LOCATION")?.[2]?.replace(/\\,/g, ",").trim() || null;
    const uidv = get("UID")?.[2]?.trim() ?? `${title}${s.d.toISOString()}`;
    const rrule = get("RRULE")?.[2];
    const base = { title, location: loc, allDay: s.allDay, source: "arbor" };
    if (rrule && /FREQ=WEEKLY/.test(rrule)) {
      const interval = Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1);
      const untilR = /UNTIL=(\d{8})/.exec(rrule)?.[1];
      const stop = Math.min(until, untilR ? Date.UTC(+untilR.slice(0, 4), +untilR.slice(4, 6) - 1, +untilR.slice(6, 8), 23, 59) : until);
      for (let t = s.d.getTime(), n = 0; t <= stop && n < 200; t += interval * 7 * 864e5, n++) {
        if (t + 864e5 < now) continue;
        evs.push({ ...base, ext: `ics:${uidv}:${t}`, start: new Date(t), end: new Date(t + end.getTime() - s.d.getTime()), recurring: true });
      }
    } else if (end.getTime() > now - 864e5 && s.d.getTime() < until) {
      evs.push({ ...base, ext: `ics:${uidv}`, start: s.d, end, recurring: /lesson|period/i.test(title) || !!subjectOf(title) });
    }
  }
  // lessons in an Arbor feed often aren't marked recurring: treat any subject-named timed event as a lesson
  for (const e of evs) if (!e.allDay && subjectOf(e.title)) e.recurring = true;
  return storeEvents(store, evs);
}

/* ---------- Outlook inbox -> inbox ---------- */
async function syncMail(store: Store, token: string) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const msgs = await all(token, `/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${since}&$orderby=receivedDateTime desc&$top=50&$select=id,subject,bodyPreview,from,webLink,receivedDateTime,isRead,inferenceClassification,importance`, 100);
  const myDomain = String((await store.get("ms_auth", "main"))?.account ?? "").split("@")[1]?.toLowerCase() ?? "";
  let added = 0, skipped = 0;
  for (const m of msgs) {
    if (isJunk(m, myDomain)) { skipped++; continue; }
    const id = uid(`inbox_items:outlook:${m.id}`);
    if (await store.get("inbox_items", id)) continue;
    await store.insert("inbox_items", { id, external_id: `outlook:${m.id}`, source: "outlook", title: m.subject || "(no subject)", body: `${m.from?.emailAddress?.name ?? ""}: ${m.bodyPreview ?? ""}`.slice(0, 1000), link: m.webLink, read_at: m.isRead ? nowIso() : null, created_at: m.receivedDateTime });
    added++;
  }
  return { emails: msgs.length, added, skipped };
}

/** Marketing, newsletters and other noise: kept out of NOESIS (they stay in Outlook). School mail always gets through. */
export function isJunk(m: Row, myDomain: string) {
  const from = String(m.from?.emailAddress?.address ?? "").toLowerCase();
  const domain = from.split("@")[1] ?? "";
  if (myDomain && (domain === myDomain || domain.endsWith(`.${myDomain}`))) return false;
  if (/teams\.microsoft\.com|sharepoint|office365|microsoft\.com$/.test(domain) && /assignment|teams|due|class/i.test(m.subject ?? "")) return false;
  if (m.importance === "high") return false;
  if (m.inferenceClassification === "other") return true;
  const subj = String(m.subject ?? "").toLowerCase(), body = String(m.bodyPreview ?? "").toLowerCase();
  if (/(newsletter|marketing|promo|offers?|deals?|mailer|mailchimp|sendgrid|hubspot|campaign|news@|info@|hello@)/.test(from)) return true;
  if (/(unsubscribe|% off|\bsale\b|limited time|special offer|discount|webinar|win a|free trial|last chance|black friday|sponsored)/.test(subj + " " + body)) return true;
  return false;
}

/* ---------- OneNote -> notes ---------- */
async function syncOneNote(store: Store, token: string, maxBodies = 12) {
  const pages = await all(token, "/me/onenote/pages?$top=100&$orderby=lastModifiedDateTime desc&$select=id,title,lastModifiedDateTime,links&$expand=parentSection($select=displayName),parentNotebook($select=displayName)", 300);
  let fetched = 0, skipped = 0;
  for (const p of pages) {
    const id = uid(`notes:onenote:${p.id}`);
    const old = await store.get("notes", id);
    if (old && old.updated_at && Date.parse(old.updated_at) >= Date.parse(p.lastModifiedDateTime)) { skipped++; continue; }
    if (fetched >= maxBodies) continue; // the rest next run (keeps each run fast)
    const html = await msFetch(`${G}/me/onenote/pages/${p.id}/content`, { headers: { authorization: `Bearer ${token}` } }, 2).then((r) => (r.ok ? r.text() : null)).catch(() => null);
    if (html == null) continue; // couldn't fetch now: keep the old copy, try next run
    fetched++;
    const row = { subject: subjectOf(p.parentNotebook?.displayName, p.parentSection?.displayName, p.title), kind: "lesson", topic: p.parentSection?.displayName ?? null, title: p.title || "Untitled page", body: strip(html).slice(0, 20000) || "(empty page)", link: p.links?.oneNoteWebUrl?.href ?? null, source: "onenote", deleted_at: null };
    if (old) await store.update("notes", id, { ...row, updated_at: p.lastModifiedDateTime });
    else await store.insert("notes", { id, external_id: `onenote:${p.id}`, ...row, updated_at: p.lastModifiedDateTime });
  }
  return { pages: pages.length, fetched, unchanged: skipped };
}

/** Run every part; one failing (e.g. a permission the school blocks) doesn't stop the others. */
/**
 * Run every part; one failing (a permission the school blocks, or Microsoft being down) doesn't stop
 * the others, and nothing already synced is deleted on failure. During an outage the scheduled sync
 * backs off (5, 10, 20, then 30 minutes) instead of hammering Microsoft; "Sync now" always tries.
 */
export async function syncMicrosoft(store: Store, parts: string[] = ["assignments", "calendar", "mail", "onenote", "ics"], opts: { scheduled?: boolean } = {}) {
  const prev = await store.get("ms_auth", "main");
  const health = (prev?.last_result?._health ?? {}) as { outageSince?: string; nextTry?: string; fails?: number; okAt?: Record<string, string> };
  if (opts.scheduled && health.nextTry && Date.parse(health.nextTry) > Date.now()) return { skipped: `backing off until ${health.nextTry} (Microsoft outage)` };
  const result: Record<string, unknown> = {};
  let outage = false;
  const okAt = { ...(health.okAt ?? {}) };
  const token = await accessToken(store).catch((e) => { if ((e as MsOutage).outage) outage = true; result.auth = (e as Error).message; return null; });
  const run = async (k: string, f: () => Promise<unknown>) => {
    if (!parts.includes(k)) return;
    if (outage && k !== "ics") { result[k] = { error: "skipped: Microsoft is down", lastOk: okAt[k] ?? null }; return; }
    try { result[k] = await f(); okAt[k] = nowIso(); }
    catch (e) { if ((e as MsOutage).outage) outage = true; result[k] = { error: (e as Error).message, lastOk: okAt[k] ?? null }; }
  };
  if (token) {
    await run("assignments", () => syncAssignments(store, token));
    await run("calendar", () => syncCalendar(store, token));
    await run("mail", () => syncMail(store, token));
    await run("onenote", () => syncOneNote(store, token));
  } else if (!result.auth) result.auth = "not connected";
  const ics = (await store.get("settings", "main"))?.data?.arbor_ics_url;
  if (ics) await run("ics", () => syncIcs(store, String(ics)));
  const fails = outage ? (health.fails ?? 0) + 1 : 0;
  result._health = outage
    ? { outageSince: health.outageSince ?? nowIso(), fails, nextTry: new Date(Date.now() + Math.min(30, 5 * 2 ** (fails - 1)) * 60_000).toISOString(), okAt }
    : { okAt };
  if (prev || ics) await saveAuth(store, { ...(outage ? {} : { last_sync: nowIso() }), last_result: result });
  return result;
}

export async function msStatus(store: Store) {
  const a = await store.get("ms_auth", "main");
  const s = await store.get("settings", "main");
  const h = a?.last_result?._health ?? {};
  return { configured: !!msClientId(), connected: !!a?.refresh_token, account: a?.account ?? null, lastSync: a?.last_sync ?? null, lastResult: a?.last_result ?? null, arbor: !!s?.data?.arbor_ics_url, outageSince: h.outageSince ?? null, nextTry: h.nextTry ?? null };
}
