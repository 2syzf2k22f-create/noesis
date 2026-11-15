// Supabase Storage (private "files" bucket) through short-lived signed links. Server-side only.
const base = () => (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = () => (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const BUCKET = "files";
const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
async function call(path: string, init: RequestInit) {
  const r = await fetch(`${base()}/storage/v1${path}`, { ...init, headers: { authorization: `Bearer ${key()}`, apikey: key(), "content-type": "application/json", ...(init.headers ?? {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`storage ${r.status}: ${j?.message ?? j?.error ?? "failed"}`);
  return j;
}
export const storageReady = () => !!base() && !!key();
/** A link the browser can PUT the file to directly (bypasses the 4.5 MB request limit). */
export async function signUpload(path: string) {
  const j = await call(`/object/upload/sign/${BUCKET}/${enc(path)}`, { method: "POST", body: "{}" });
  return `${base()}/storage/v1${j.url}`;
}
/** A link to read the file for the next `seconds`. */
export async function signDownload(path: string, seconds = 600, download?: string) {
  const j = await call(`/object/sign/${BUCKET}/${enc(path)}`, { method: "POST", body: JSON.stringify({ expiresIn: seconds }) });
  return `${base()}/storage/v1${j.signedURL ?? j.signedUrl}${download ? `&download=${encodeURIComponent(download)}` : ""}`;
}
export async function readObject(path: string) {
  const r = await fetch(await signDownload(path, 120));
  if (!r.ok) throw new Error(`storage ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}
export async function copyObject(from: string, to: string) {
  await call(`/object/copy`, { method: "POST", body: JSON.stringify({ bucketId: BUCKET, sourceKey: from, destinationKey: to }) });
}
export async function removeObjects(paths: string[]) {
  if (paths.length) await call(`/object/${BUCKET}`, { method: "DELETE", body: JSON.stringify({ prefixes: paths }) });
}
