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
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return {
    SUPABASE_URL: url ? (/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url.trim()) ? "set, looks right" : "set, but doesn't look like https://<ref>.supabase.co") : "missing",
    SUPABASE_SECRET_KEY: key ? (/^(sb_secret_|eyJ)/.test(key.trim()) ? "set, looks right" : "set, but doesn't look like a secret/service_role key") : "missing",
    whitespace: url !== url.trim() || key !== key.trim() ? "a value has spaces/newlines around it" : "ok",
  };
}
