import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nowIso, withDefaults, type ListOpts, type Row, type Store } from "./store";

/** Server/relay only: uses the secret key, which bypasses RLS. Never import from client code. */
export class SupabaseStore implements Store {
  kind = "supabase" as const;
  private db: SupabaseClient;
  constructor(url: string, secretKey: string) {
    this.db = createClient(url, secretKey, {
      db: { schema: "noesis" },
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as SupabaseClient;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private apply(q: any, o: ListOpts = {}) {
    if (o.eq) for (const [k, v] of Object.entries(o.eq)) q = v === null ? q.is(k, null) : q.eq(k, v);
    if (o.isNull) for (const k of o.isNull) q = q.is(k, null);
    return q;
  }
  private ok<T>(r: { data: T; error: { message: string } | null }): T {
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }

  async rpc(fn: string, args: Record<string, unknown>) {
    return this.ok(await this.db.rpc(fn, args));
  }
  async get(table: string, id: string) {
    return this.ok(await this.db.from(table).select("*").eq("id", id).maybeSingle()) as Row | null;
  }
  async list(table: string, o: ListOpts = {}) {
    let q = this.apply(this.db.from(table).select("*"), o);
    if (o.order) q = q.order(o.order.col, { ascending: o.order.asc ?? true });
    if (o.limit) q = q.limit(o.limit);
    return (this.ok(await q) ?? []) as Row[];
  }
  async count(table: string, o: ListOpts & { since?: { col: string; iso: string } } = {}) {
    let q = this.apply(this.db.from(table).select("id", { count: "exact", head: true }), o);
    if (o.since) q = q.gte(o.since.col, o.since.iso);
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.count ?? 0;
  }
  async insert(table: string, row: Partial<Row>) {
    return this.ok(await this.db.from(table).upsert(withDefaults(table, row)).select("*").single()) as Row;
  }
  async update(table: string, id: string, patch: Partial<Row>) {
    return this.ok(await this.db.from(table).update(patch).eq("id", id).select("*").maybeSingle()) as Row | null;
  }
  async remove(table: string, id: string) {
    this.ok(await this.db.from(table).delete().eq("id", id));
  }
  async claimNextJob() {
    const t = nowIso();
    const cand = this.ok(
      await this.db.from("jobs").select("id,status")
        .or(`status.eq.queued,and(status.eq.rate_limited,retry_at.lte.${t})`)
        .order("created_at", { ascending: true }).limit(1),
    ) as Row[];
    if (!cand?.length) return null;
    // Only one claimer wins: the update is conditional on the status it was read with.
    return this.ok(
      await this.db.from("jobs").update({ status: "running", started_at: t, error: null })
        .eq("id", cand[0].id).eq("status", cand[0].status).select("*").maybeSingle(),
    ) as Row | null;
  }
}
