import { FileStore, type Store } from "./store";
import { SupabaseStore } from "./supabaseStore";

let cached: Store | null | undefined;

/**
 * SUPABASE_URL + SUPABASE_SECRET_KEY  -> Supabase (production, relay)
 * NOESIS_DEV_STORE=/path/db.json     -> local file (development, tests)
 * neither                            -> null: Apollo reports it isn't connected.
 */
export function getStore(): Store | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (url && key) cached = new SupabaseStore(url, key);
  else if (process.env.NOESIS_DEV_STORE) cached = new FileStore(process.env.NOESIS_DEV_STORE);
  else cached = null;
  return cached;
}
