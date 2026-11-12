// Generated UI: Apollo describes pages and widgets as compact JSON specs; the site validates
// and renders them with its own component library. Numbers come from bindings computed in code.
import { z } from "zod";

export const BLOCK_TYPES = [
  "heading", "text", "stat", "sparkline", "ring", "donut", "bar", "line", "area", "heatmap",
  "table", "list", "form", "kanban", "timer", "flashcards", "quiz", "media", "wave", "custom",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** Read data from a table. `agg` turns rows into numbers on the server. */
export const BindSchema = z.object({
  table: z.string(),
  where: z.record(z.string(), scalar).optional(),
  order: z.object({ col: z.string(), asc: z.boolean().optional() }).optional(),
  limit: z.number().int().min(1).max(500).optional(),
  /** Only rows from the last N days (by created_at, or `dateField`). */
  days: z.number().int().min(1).max(366).optional(),
  dateField: z.string().optional(),
  agg: z.object({
    fn: z.enum(["count", "sum", "avg", "max", "min", "last"]),
    field: z.string().optional(),
    /** Group into a series: one value per day, or per distinct value of a field. */
    by: z.union([z.literal("day"), z.literal("week"), z.object({ field: z.string() })]).optional(),
  }).optional(),
});
export type Bind = z.infer<typeof BindSchema>;

export const BlockSchema = z.object({
  id: z.string().optional(),
  type: z.enum(BLOCK_TYPES),
  title: z.string().optional(),
  /** Grid columns out of 12 (desktop). */
  span: z.number().int().min(1).max(12).optional(),
  rows: z.number().int().min(1).max(6).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
  bind: BindSchema.optional(),
});
export type Block = z.infer<typeof BlockSchema>;

export const PageSpecSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  blocks: z.array(BlockSchema).max(60),
});
export type PageSpec = z.infer<typeof PageSpecSchema>;

export function parseSpec(x: unknown): { ok: true; spec: PageSpec } | { ok: false; error: string } {
  const r = PageSpecSchema.safeParse(x);
  return r.success ? { ok: true, spec: r.data } : { ok: false, error: r.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
