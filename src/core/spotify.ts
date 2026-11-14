// Spotify: sign-in (Authorization Code with PKCE, no client secret), automatic token refresh, and the
// Web API calls Apollo's music tools use. Tokens live only in noesis.integrations (server/relay side):
// they're never returned to the browser, logged, or put in tool results.
import { createHash, randomBytes } from "node:crypto";
import { nowIso, type Store } from "./store";

export const SPOTIFY_SCOPES = "user-library-read user-read-playback-state user-modify-playback-state user-read-recently-played playlist-read-private user-top-read";
export const spotifyClientId = () => process.env.SPOTIFY_CLIENT_ID ?? "";
export const spotifyRedirect = (origin: string) => process.env.SPOTIFY_REDIRECT_URI ?? `${origin}/api/spotify/callback`;
const API = "https://api.spotify.com/v1";

export function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
export function authorizeUrl(origin: string, state: string, challenge: string) {
  return `https://accounts.spotify.com/authorize?${new URLSearchParams({
    client_id: spotifyClientId(), response_type: "code", redirect_uri: spotifyRedirect(origin), scope: SPOTIFY_SCOPES,
    state, code_challenge_method: "S256", code_challenge: challenge,
  })}`;
}

type Auth = { client_id?: string; refresh_token?: string; access_token?: string; expires_at?: string; user?: string | null; product?: string | null; connected_at?: string };
async function getAuth(s: Store): Promise<Auth | null> { return ((await s.get("integrations", "spotify").catch(() => null))?.data as Auth) ?? null; }
async function saveAuth(s: Store, patch: Auth | null) {
  const cur = await s.get("integrations", "spotify").catch(() => null);
  const data = patch === null ? {} : { ...(cur?.data ?? {}), ...patch };
  if (cur) await s.update("integrations", "spotify", { data, updated_at: nowIso() });
  else await s.insert("integrations", { id: "spotify", data, updated_at: nowIso() });
}

async function tokenRequest(body: Record<string, string>) {
  const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = await r.json().catch(() => ({}));
  // never include the response body in errors: it can contain tokens
  if (!r.ok) throw new Error(`Spotify sign-in failed (${r.status}${j?.error ? `: ${j.error}` : ""})`);
  return j as { access_token: string; refresh_token?: string; expires_in: number };
}

/** Finish sign-in: swap the code for tokens and remember who's connected. */
export async function finishLogin(s: Store, origin: string, code: string, verifier: string) {
  const client_id = spotifyClientId();
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: spotifyRedirect(origin), client_id, code_verifier: verifier });
  const me = await fetch(`${API}/me`, { headers: { authorization: `Bearer ${t.access_token}` } }).then((r) => r.json()).catch(() => ({}));
  await saveAuth(s, { client_id, refresh_token: t.refresh_token, access_token: t.access_token, expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(), user: me.display_name ?? me.id ?? null, product: me.product ?? null, connected_at: nowIso() });
}

export async function spotifyStatus(s: Store) {
  const a = await getAuth(s);
  return { configured: !!spotifyClientId() || !!a?.client_id, connected: !!a?.refresh_token, user: a?.user ?? null, product: a?.product ?? null, premium: a?.product === "premium" };
}
export const disconnectSpotify = (s: Store) => saveAuth(s, null);

/** A valid access token, refreshing (and storing a rotated refresh token) when needed. */
async function accessToken(s: Store): Promise<string | null> {
  const a = await getAuth(s);
  if (!a?.refresh_token) return null;
  if (a.access_token && a.expires_at && Date.parse(a.expires_at) > Date.now()) return a.access_token;
  const client_id = a.client_id || spotifyClientId();
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: a.refresh_token, client_id });
  await saveAuth(s, { access_token: t.access_token, refresh_token: t.refresh_token ?? a.refresh_token, expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString() });
  return t.access_token;
}

export class SpotifyError extends Error { constructor(msg: string, public status: number, public reason?: string) { super(msg); } }
async function api(s: Store, path: string, init: RequestInit = {}, retried = false): Promise<unknown> {
  const tok = await accessToken(s);
  if (!tok) throw new SpotifyError("Spotify isn't connected", 401, "NOT_CONNECTED");
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${tok}`, "content-type": "application/json" } });
  if (r.status === 401 && !retried) { await saveAuth(s, { expires_at: new Date(0).toISOString() }); return api(s, path, init, true); }
  if (r.status === 204 || r.status === 202) return null;
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new SpotifyError(j?.error?.message ?? `Spotify answered ${r.status}`, r.status, j?.error?.reason);
  return j;
}

export type Track = { uri: string; name: string; artists: string; album: string; added_at?: string; played_at?: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const track = (t: any, extra: Partial<Track> = {}): Track => ({ uri: t.uri, name: t.name, artists: (t.artists ?? []).map((a: { name: string }) => a.name).join(", "), album: t.album?.name ?? "", ...extra });

export async function searchTracks(s: Store, q: string, limit = 5): Promise<Track[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const j = (await api(s, `/search?${new URLSearchParams({ q, type: "track", limit: String(limit) })}`)) as any;
  return (j?.tracks?.items ?? []).map((t: unknown) => track(t));
}

/** Liked Songs newest first ("recent"), most-played ("top"), or recently played. */
export async function library(s: Store, sort: "recent" | "top" | "played", limit = 10): Promise<Track[]> {
  const n = String(Math.min(50, Math.max(1, limit)));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (sort === "top") return (((await api(s, `/me/top/tracks?limit=${n}&time_range=short_term`)) as any)?.items ?? []).map((t: unknown) => track(t));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (sort === "played") return (((await api(s, `/me/player/recently-played?limit=${n}`)) as any)?.items ?? []).map((i: any) => track(i.track, { played_at: i.played_at }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (((await api(s, `/me/tracks?limit=${n}`)) as any)?.items ?? []).map((i: any) => track(i.track, { added_at: i.added_at }));
}

type Device = { id: string; name: string; type: string; is_active: boolean };
async function devices(s: Store): Promise<Device[]> {
  return (((await api(s, "/me/player/devices")) as { devices?: Device[] })?.devices ?? []);
}

/** Play a track. If no Spotify device is running, `wake` (on the PC: open the Spotify app) is called and we retry. */
export async function playTrack(s: Store, uri: string, wake?: () => Promise<void>) {
  let ds = await devices(s);
  if (!ds.length && wake) {
    await wake();
    for (let i = 0; i < 8 && !ds.length; i++) { await new Promise((r) => setTimeout(r, 1500)); ds = await devices(s); }
  }
  if (!ds.length) throw new SpotifyError("No Spotify device is open. Open the Spotify app and try again.", 404, "NO_ACTIVE_DEVICE");
  const d = ds.find((x) => x.is_active) ?? ds.find((x) => x.type === "Computer") ?? ds[0];
  await api(s, `/me/player/play?device_id=${encodeURIComponent(d.id)}`, { method: "PUT", body: JSON.stringify({ uris: [uri] }) });
  return { device: d.name };
}
export const pause = (s: Store) => api(s, "/me/player/pause", { method: "PUT" });
export const nextTrack = (s: Store) => api(s, "/me/player/next", { method: "POST" });

/** Why playback can't work, in plain words (null = fine). */
export function explain(e: unknown): string {
  if (e instanceof SpotifyError) {
    if (e.reason === "NOT_CONNECTED") return "Spotify isn't connected (Settings › Connect Spotify)";
    if (e.reason === "PREMIUM_REQUIRED" || (e.status === 403 && /premium/i.test(e.message))) return "starting a specific song needs Spotify Premium";
    if (e.reason === "NO_ACTIVE_DEVICE") return "the Spotify app isn't open";
    return `Spotify said: ${e.message}`;
  }
  return (e as Error)?.message ?? String(e);
}
