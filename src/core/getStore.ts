import { FileStore, type Store } from "./store";
import { SupabaseStore } from "./supabaseStore";

let cached: Store | null | undefined;

/**
 * SUPABASE_URL + SUPABASE_SECRET_KEY  -> Supabase (production, relay)
 * NOESIS_DEV_STORE=/path/db.json     -> local file (development, tests)
 * neither                            -> null: Apollo reports it isn't connected.
 */
export function getStore(): Store | null {
  if (cached) return cached;
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim();
  if (url && key) cached = new SupabaseStore(url, key);
  else if (process.env.NOESIS_DEV_STORE) cached = new FileStore(process.env.NOESIS_DEV_STORE);
  else return null; // not cached: env vars are re-read on the next request
  return cached;
}

/** Which settings the server can see (never their values), for diagnosing "not connected". */
export function envReport() {
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const keyVar = process.env.SUPABASE_SECRET_KEY ? "SUPABASE_SECRET_KEY" : process.env.SUPABASE_SERVICE_ROLE_KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null;
  const key = (keyVar ? process.env[keyVar] : "")?.trim() ?? "";
  const urlRef = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1] ?? null;
  // describe the key without revealing it
  let keyKind = "missing", keyRef: string | null = null;
  if (key.startsWith("sb_secret_")) keyKind = "new secret key (right kind)";
  else if (key.startsWith("sb_publishable_")) keyKind = "PUBLISHABLE key (wrong kind: needs the secret key)";
  else if (key.startsWith("eyJ")) {
    try {
      const p = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString());
      keyRef = p.ref ?? null;
      keyKind = p.role === "service_role" ? "legacy service_role key (right kind)" : `legacy ${p.role} key (wrong kind: needs service_role/secret)`;
    } catch { keyKind = "looks like a JWT but can't be read (copied wrong?)"; }
  } else if (key) keyKind = "unrecognised format (copied wrong?)";
  return {
    url: url ? `https://${urlRef ?? "?"}.supabase.co${urlRef ? "" : " (doesn't look like a Supabase URL)"}` : "missing",
    urlFrom: process.env.SUPABASE_URL ? "SUPABASE_URL" : process.env.NEXT_PUBLIC_SUPABASE_URL ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    keyFrom: keyVar, keyKind, keyLength: key.length,
    keyProject: keyRef ? (keyRef === urlRef ? `${keyRef} (matches the URL)` : `${keyRef} (DOESN'T match the URL ${urlRef})`) : null,
    supabaseVarsPresent: Object.keys(process.env).filter((k) => /SUPABASE|POSTGRES/.test(k)).sort(),
    whitespace: (process.env.SUPABASE_URL ?? "") !== (process.env.SUPABASE_URL ?? "").trim() || (keyVar && process.env[keyVar] !== key) ? "a value has spaces/newlines around it (trimmed automatically)" : "ok",
  };
}
