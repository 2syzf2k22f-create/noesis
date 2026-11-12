// Site tools: the only way Apollo can change anything. No shell, no file system.
// Every write is recorded in action_log with before/after, deletes go to trash,
// and undo/rollback replay the log backwards. No confirmation prompts by design.
import { z } from "zod";
import { PRESETS } from "../theme/presets";
import { nowIso, type Row, type Store } from "./store";

export const WRITABLE = ["settings", "themes", "pages", "widgets", "profile_facts", "inbox_items", "files", "conversations"] as const;
const READABLE = [...WRITABLE, "action_log", "trash"] as const;
const SOFT_DELETE = new Set(["pages", "widgets", "inbox_items", "files", "conversations"]);
const SPACE_IDS = ["school", "fitness", "nutrition", "projects", "mind", "languages", "library", "stats", "inbox", "chats"];
const PANEL_KINDS = ["spaces", "style", "orb", "inbox", "stats", "apollo"] as const;

export type UiAction =
  | { type: "navigate"; to: string }
  | { type: "open_panel"; kind: string }
  | { type: "set_theme"; id: string };

export type ToolCtx = { store: Store; jobId?: string | null; actor?: string };

async function pushUi(ctx: ToolCtx, ui: UiAction) {
  if (!ctx.jobId) return;
  const job = await ctx.store.get("jobs", ctx.jobId);
  if (job) await ctx.store.update("jobs", ctx.jobId, { ui_actions: [...(job.ui_actions ?? []), ui] });
}

async function log(ctx: ToolCtx, tool: string, table: string | null, rowId: string | null, before: Row | null, after: Row | null) {
  await ctx.store.insert("action_log", {
    job_id: ctx.jobId ?? null, actor: ctx.actor ?? "apollo", tool,
    table_name: table, row_id: rowId, before, after, undone_at: null,
  });
}

const trim = (r: Row | null) => r; // hook for shrinking large rows in tool output later

async function currentThemeId(store: Store) {
  return (await store.get("settings", "main"))?.theme_id ?? "midnight";
}

async function themeExists(store: Store, id: string) {
  return PRESETS.some((p) => p.id === id) || !!(await store.get("themes", id));
}

const tableEnum = z.enum(WRITABLE);
const readEnum = z.enum(READABLE);
const json = z.record(z.string(), z.unknown());

export type ToolDef = {
  name: string;
  description: string;
  input: z.ZodRawShape;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (ctx: ToolCtx, args: any) => Promise<unknown>;
};

export const TOOLS: ToolDef[] = [
  {
    name: "list_records",
    description: `List rows of a table (newest first). Tables: ${READABLE.join(", ")}.`,
    input: { table: readEnum, where: json.optional(), include_deleted: z.boolean().optional(), limit: z.number().int().min(1).max(100).optional() },
    async run({ store }, a) {
      const rows = await store.list(a.table, {
        eq: a.where as Record<string, string | number | boolean | null> | undefined,
        isNull: SOFT_DELETE.has(a.table) && !a.include_deleted ? ["deleted_at"] : undefined,
        order: { col: "created_at", asc: false }, limit: a.limit ?? 20,
      });
      return rows.map(trim);
    },
  },
  {
    name: "get_record",
    description: "Get one row by id.",
    input: { table: readEnum, id: z.string() },
    async run({ store }, a) {
      return (await store.get(a.table, a.id)) ?? { error: "not found" };
    },
  },
  {
    name: "create_record",
    description: `Create a row. Tables: ${WRITABLE.join(", ")}.`,
    input: { table: tableEnum, data: json },
    async run(ctx, a) {
      const row = await ctx.store.insert(a.table, { ...a.data, id: undefined });
      await log(ctx, "create_record", a.table, row.id, null, row);
      return row;
    },
  },
  {
    name: "update_record",
    description: "Change fields on a row. Only the given fields change.",
    input: { table: tableEnum, id: z.string(), data: json },
    async run(ctx, a) {
      const before = await ctx.store.get(a.table, a.id);
      if (!before) return { error: "not found" };
      const after = await ctx.store.update(a.table, a.id, { ...a.data, id: undefined, updated_at: nowIso() });
      await log(ctx, "update_record", a.table, a.id, before, after);
      return after;
    },
  },
  {
    name: "delete_record",
    description: "Delete a row. It goes to the trash and can be restored for 30 days.",
    input: { table: tableEnum, id: z.string() },
    async run(ctx, a) {
      const before = await ctx.store.get(a.table, a.id);
      if (!before) return { error: "not found" };
      await ctx.store.insert("trash", { table_name: a.table, row_id: a.id, data: before, deleted_at: nowIso() });
      let after: Row | null = null;
      if (SOFT_DELETE.has(a.table)) after = await ctx.store.update(a.table, a.id, { deleted_at: nowIso() });
      else await ctx.store.remove(a.table, a.id);
      await log(ctx, "delete_record", a.table, a.id, before, after);
      return { deleted: a.id, restorable: true };
    },
  },
  {
    name: "restore_from_trash",
    description: "Restore a deleted row from the trash by its trash id.",
    input: { trash_id: z.string() },
    async run(ctx, a) {
      const t = await ctx.store.get("trash", a.trash_id);
      if (!t) return { error: "not in trash" };
      const before = await ctx.store.get(t.table_name, t.row_id);
      const restored = before
        ? await ctx.store.update(t.table_name, t.row_id, { ...t.data, deleted_at: null })
        : await ctx.store.insert(t.table_name, { ...t.data, deleted_at: null });
      await ctx.store.remove("trash", t.id);
      await log(ctx, "restore_from_trash", t.table_name, t.row_id, before, restored);
      return restored;
    },
  },
  {
    name: "set_theme",
    description: `Switch the site's style preset. Built-in: ${PRESETS.map((p) => `${p.id} (${p.name})`).join(", ")}; or a custom theme id.`,
    input: { id: z.string() },
    async run(ctx, a) {
      if (!(await themeExists(ctx.store, a.id))) return { error: `unknown theme ${a.id}` };
      const before = await ctx.store.get("settings", "main");
      const after = before
        ? await ctx.store.update("settings", "main", { theme_id: a.id, updated_at: nowIso() })
        : await ctx.store.insert("settings", { id: "main", theme_id: a.id, updated_at: nowIso() });
      await log(ctx, "set_theme", "settings", "main", before, after);
      await pushUi(ctx, { type: "set_theme", id: a.id });
      return { theme: a.id };
    },
  },
  {
    name: "navigate",
    description: `Open a page for the user: "home" or a space (${SPACE_IDS.join(", ")}).`,
    input: { to: z.string() },
    async run(ctx, a) {
      const to = String(a.to).toLowerCase();
      if (to !== "home" && !SPACE_IDS.includes(to)) return { error: `unknown page ${a.to}` };
      await pushUi(ctx, { type: "navigate", to });
      return { navigated: to };
    },
  },
  {
    name: "open_panel",
    description: `Slide a panel in beside the orb: ${PANEL_KINDS.join(", ")}.`,
    input: { kind: z.enum(PANEL_KINDS) },
    async run(ctx, a) {
      await pushUi(ctx, { type: "open_panel", kind: a.kind });
      return { opened: a.kind };
    },
  },
  {
    name: "add_inbox_item",
    description: "Save something to the user's inbox.",
    input: { title: z.string(), body: z.string().optional(), source: z.string().optional(), link: z.string().optional(), due_at: z.string().optional() },
    async run(ctx, a) {
      const row = await ctx.store.insert("inbox_items", { source: a.source ?? "apollo", title: a.title, body: a.body ?? null, link: a.link ?? null, due_at: a.due_at ?? null });
      await log(ctx, "add_inbox_item", "inbox_items", row.id, null, row);
      return row;
    },
  },
  {
    name: "remember_fact",
    description: "Store or update a short durable fact about the user (used as memory between chats).",
    input: { key: z.string(), value: z.string() },
    async run(ctx, a) {
      const existing = (await ctx.store.list("profile_facts", { eq: { key: a.key }, limit: 1 }))[0] ?? null;
      const row = existing
        ? await ctx.store.update("profile_facts", existing.id, { value: a.value, updated_at: nowIso() })
        : await ctx.store.insert("profile_facts", { key: a.key, value: a.value, updated_at: nowIso() });
      await log(ctx, "remember_fact", "profile_facts", row!.id, existing, row);
      return row;
    },
  },
  {
    name: "list_actions",
    description: "Recent changes Apollo made (the action log), newest first.",
    input: { limit: z.number().int().min(1).max(50).optional() },
    async run({ store }, a) {
      const rows = await store.list("action_log", { order: { col: "created_at", asc: false }, limit: a.limit ?? 15 });
      return rows.map((r) => ({ id: r.id, tool: r.tool, table: r.table_name, row_id: r.row_id, at: r.created_at, undone: !!r.undone_at }));
    },
  },
  {
    name: "undo",
    description: "Undo the most recent change that hasn't been undone.",
    input: {},
    async run(ctx) {
      return undo(ctx);
    },
  },
  {
    name: "rollback",
    description: "Undo every change made after (and including) the given action id.",
    input: { action_id: z.string() },
    async run(ctx, a) {
      return rollback(ctx, a.action_id);
    },
  },
];

async function revert(ctx: ToolCtx, a: Row): Promise<UiAction | null> {
  const { store } = ctx;
  let ui: UiAction | null = null;
  if (a.table_name && a.row_id) {
    if (a.before == null) await store.remove(a.table_name, a.row_id);
    else if (await store.get(a.table_name, a.row_id)) await store.update(a.table_name, a.row_id, a.before);
    else await store.insert(a.table_name, a.before);
    if (a.tool === "delete_record") {
      for (const t of await store.list("trash", { eq: { table_name: a.table_name, row_id: a.row_id } })) await store.remove("trash", t.id);
    }
  }
  if (a.tool === "set_theme") {
    ui = { type: "set_theme", id: a.before?.theme_id ?? "midnight" };
    await pushUi(ctx, ui);
  }
  await store.update("action_log", a.id, { undone_at: nowIso() });
  return ui;
}

async function liveActions(store: Store) {
  return store.list("action_log", { isNull: ["undone_at"], order: { col: "created_at", asc: false }, limit: 200 });
}

export async function undo(ctx: ToolCtx) {
  const last = (await liveActions(ctx.store))[0];
  if (!last) return { undone: 0, ui: [] as UiAction[] };
  const ui = await revert(ctx, last);
  return { undone: 1, tool: last.tool, ui: ui ? [ui] : [] };
}

export async function rollback(ctx: ToolCtx, actionId: string) {
  const live = await liveActions(ctx.store);
  const idx = live.findIndex((r) => r.id === actionId);
  if (idx < 0) return { error: "action not found or already undone", undone: 0, ui: [] as UiAction[] };
  const ui: UiAction[] = [];
  for (const a of live.slice(0, idx + 1)) {
    const u = await revert(ctx, a);
    if (u) ui.push(u);
  }
  return { undone: idx + 1, ui };
}

export { currentThemeId };
