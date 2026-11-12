// Storage behind Apollo. Supabase in production; a JSON file for local development
// (both the site and the relay can share it, so the whole loop runs without a database).
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = { id: string; [k: string]: any };

export type ListOpts = {
  eq?: Record<string, string | number | boolean | null>;
  /** Only rows where these columns are null (e.g. ["deleted_at"]). */
  isNull?: string[];
  order?: { col: string; asc?: boolean };
  limit?: number;
};

export interface Store {
  kind: "supabase" | "file";
  get(table: string, id: string): Promise<Row | null>;
  list(table: string, opts?: ListOpts): Promise<Row[]>;
  count(table: string, opts?: ListOpts & { since?: { col: string; iso: string } }): Promise<number>;
  insert(table: string, row: Partial<Row>): Promise<Row>;
  update(table: string, id: string, patch: Partial<Row>): Promise<Row | null>;
  remove(table: string, id: string): Promise<void>;
  /** Atomically move the oldest queued (or due rate-limited) job to running. */
  claimNextJob(): Promise<Row | null>;
}

export const nowIso = () => new Date().toISOString();

const TEXT_ID = new Set(["settings", "relay_status", "chat_summaries"]);

export function withDefaults(table: string, row: Partial<Row>): Row {
  const t = nowIso();
  const out: Row = { ...row, id: row.id ?? (TEXT_ID.has(table) ? "main" : randomUUID()) };
  if (out.created_at === undefined && table !== "settings" && table !== "relay_status") out.created_at = t;
  return out;
}

function matches(r: Row, o: ListOpts = {}) {
  if (o.eq) for (const [k, v] of Object.entries(o.eq)) if ((r[k] ?? null) !== v) return false;
  if (o.isNull) for (const k of o.isNull) if (r[k] != null) return false;
  return true;
}

function sortRows(rows: Row[], o: ListOpts = {}) {
  if (o.order) {
    const { col, asc = true } = o.order;
    rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (asc ? 1 : -1));
  }
  return o.limit ? rows.slice(0, o.limit) : rows;
}

export class FileStore implements Store {
  kind = "file" as const;
  constructor(private path: string) {}

  private read(): Record<string, Row[]> {
    try {
      return JSON.parse(readFileSync(this.path, "utf8"));
    } catch {
      return {};
    }
  }
  private write(db: Record<string, Row[]>) {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(db));
    renameSync(tmp, this.path);
  }

  async get(table: string, id: string) {
    return this.read()[table]?.find((r) => r.id === id) ?? null;
  }
  async list(table: string, o?: ListOpts) {
    return sortRows((this.read()[table] ?? []).filter((r) => matches(r, o)), o);
  }
  async count(table: string, o?: ListOpts & { since?: { col: string; iso: string } }) {
    return (this.read()[table] ?? []).filter((r) => matches(r, o) && (!o?.since || r[o.since.col] >= o.since.iso)).length;
  }
  async insert(table: string, row: Partial<Row>) {
    const db = this.read();
    const r = withDefaults(table, row);
    db[table] = [...(db[table] ?? []).filter((x) => x.id !== r.id), r];
    this.write(db);
    return r;
  }
  async update(table: string, id: string, patch: Partial<Row>) {
    const db = this.read();
    const list = db[table] ?? [];
    const i = list.findIndex((r) => r.id === id);
    if (i < 0) return null;
    list[i] = { ...list[i], ...patch, id };
    db[table] = list;
    this.write(db);
    return list[i];
  }
  async remove(table: string, id: string) {
    const db = this.read();
    db[table] = (db[table] ?? []).filter((r) => r.id !== id);
    this.write(db);
  }
  async claimNextJob() {
    const db = this.read();
    const t = nowIso();
    const job = (db.jobs ?? [])
      .filter((j) => j.status === "queued" || (j.status === "rate_limited" && (!j.retry_at || j.retry_at <= t)))
      .sort((a, b) => (a.created_at > b.created_at ? 1 : -1))[0];
    if (!job) return null;
    Object.assign(job, { status: "running", started_at: t, error: null });
    this.write(db);
    return job;
  }
}
