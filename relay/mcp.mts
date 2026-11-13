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

const server = new McpServer({ name: "noesis", version: "0.4.0" });
const ctx = { store, jobId: process.env.NOESIS_JOB_ID || null, actor: process.env.NOESIS_ACTOR || "apollo" };

for (const t of TOOLS) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.input }, async (args: unknown) => {
    try {
      const out = await t.run(ctx, args ?? {});
      return { content: [{ type: "text" as const, text: JSON.stringify(out) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String((e as Error).message ?? e) }] };
    }
  });
}

await server.connect(new StdioServerTransport());
