// The site's tool server over stdio. Started by Claude Code for each Apollo job
// (NOESIS_JOB_ID tells it which job its UI actions belong to).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getStore } from "../src/core/getStore";
import { TOOLS } from "../src/core/tools";

const store = getStore();
if (!store) {
  console.error("noesis-mcp: no store configured (set SUPABASE_URL + SUPABASE_SECRET_KEY)");
  process.exit(1);
}

/** Shrink tool output before it reaches the model: drop empty/noisy fields, cap long text and long lists. */
const NOISY = new Set(["updated_at", "deleted_at", "embedding", "external_id", "ui_actions", "before", "after"]);
function compact(v: unknown, depth = 0): unknown {
  if (v == null) return undefined;
  if (typeof v === "string") return v.length > 600 ? `${v.slice(0, 600)}… (+${v.length - 600} chars)` : v;
  if (Array.isArray(v)) { const xs = v.slice(0, 60).map((x) => compact(x, depth + 1)); return v.length > 60 ? [...xs, `…and ${v.length - 60} more`] : xs; }
  if (typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) { if (NOISY.has(k) && depth > 0) continue; const c = compact(x, depth + 1); if (c !== undefined && c !== "") o[k] = c; }
    return o;
  }
  return v;
}

const server = new McpServer({ name: "noesis", version: "0.4.0" });
const ctx = { store, jobId: process.env.NOESIS_JOB_ID || null, actor: process.env.NOESIS_ACTOR || "apollo" };

for (const t of TOOLS) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.input }, async (args: unknown) => {
    try {
      const out = await t.run(ctx, args ?? {});
      return { content: [{ type: "text" as const, text: JSON.stringify(compact(out) ?? null) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String((e as Error).message ?? e) }] };
    }
  });
}

await server.connect(new StdioServerTransport());
