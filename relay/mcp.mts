// The site's tool server over stdio. Started by Claude Code for each Apollo job
// (NOESIS_JOB_ID tells it which job its UI actions belong to).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getStore } from "../src/core/getStore";
import { TOOLS } from "../src/core/tools";
import { setSemanticSearch } from "../src/core/notes";
import { semanticSearch } from "./embed.mts";
import { PC_TOOLS } from "./pc.mts";
import { FILE_TOOLS } from "./files.mts";
import { SPEC_TOOLS } from "./spec.mts";
import { DESK_TOOLS } from "./desk.mts";

const store = getStore();
if (!store) {
  console.error("noesis-mcp: no store configured (set SUPABASE_URL + SUPABASE_SECRET_KEY)");
  process.exit(1);
}

if (process.env.NOESIS_SMART !== "0") setSemanticSearch(semanticSearch);

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

// PC control (only here, on Reg's PC): risky commands become approval cards
if (process.env.NOESIS_PC !== "0") for (const t of [...PC_TOOLS, ...DESK_TOOLS, ...FILE_TOOLS, ...SPEC_TOOLS]) {
  server.registerTool(t.name, { description: t.description, inputSchema: t.input }, async (args: unknown) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const out = (await t.run(ctx as any, (args ?? {}) as any)) as Record<string, unknown> | null;
      // screenshots come back as a real image so Apollo can look at them
      const img = out?.__image as { data: string; mimeType: string } | undefined;
      if (img) {
        const { __image: _drop, ...rest } = out!;
        void _drop;
        return { content: [{ type: "image" as const, data: img.data, mimeType: img.mimeType }, { type: "text" as const, text: JSON.stringify(rest) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(out) }] };
    } catch (e) {
      return { isError: true, content: [{ type: "text" as const, text: String((e as Error).message ?? e) }] };
    }
  });
}

await server.connect(new StdioServerTransport());
