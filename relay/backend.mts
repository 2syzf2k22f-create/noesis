// AI backends. Today: Claude Code headless on the Pro plan. Swap in an API backend later
// by implementing the same interface.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export type PlanWindow = { utilization: number; resetsAt: number; status: string };
export type RunResult = {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  isError: boolean;
  rateLimited: { resetsAt: number | null } | null;
  plan: Record<string, PlanWindow> | null;
};
export type RunOpts = {
  model: string;
  system: string;
  prompt: string;
  /** Path to an MCP config JSON; omit for a run with no tools at all. */
  mcpConfig?: string;
  /** Built-in Claude Code tools to allow (only research jobs use this: "WebSearch,WebFetch"). */
  builtins?: string[];
  onText?: (soFar: string) => void;
  timeoutMs?: number;
};
export interface Backend {
  name: string;
  run(o: RunOpts): Promise<RunResult>;
}

/** Empty working directory so no CLAUDE.md or project settings leak into Apollo jobs. */
const SANDBOX = join(import.meta.dirname, ".sandbox");

export const claudeCode = (bin = process.env.CLAUDE_BIN ?? "claude"): Backend => ({
  name: "claude-code",
  run(o) {
    mkdirSync(SANDBOX, { recursive: true });
    const args = [
      "-p", "--model", o.model,
      "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--no-session-persistence",
      "--system-prompt", o.system,
      // No built-in tools at all (no Bash, no files, no web). Only the site's MCP tools.
      "--tools", (o.builtins ?? []).join(","),
      "--strict-mcp-config",
    ];
    const allowed = [...(o.mcpConfig ? ["mcp__noesis"] : []), ...(o.builtins ?? [])];
    if (o.mcpConfig) args.push("--mcp-config", o.mcpConfig);
    if (allowed.length) args.push("--allowedTools", ...allowed);

    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { cwd: SANDBOX, stdio: ["pipe", "pipe", "pipe"], shell: process.platform === "win32" });
      const res: RunResult = { text: "", model: o.model, tokensIn: 0, tokensOut: 0, isError: false, rateLimited: null, plan: null };
      let buf = "", errBuf = "", turnText = "";
      const timer = setTimeout(() => child.kill(), o.timeoutMs ?? 5 * 60_000);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          let ev;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "stream_event") {
            const e = ev.event;
            if (e?.type === "message_start") turnText = ""; // text before a tool call is replaced by the final turn
            if (e?.type === "content_block_delta" && e.delta?.type === "text_delta") {
              turnText += e.delta.text;
              o.onText?.(turnText);
            }
            if (e?.type === "message_start" && e.message?.model) res.model = e.message.model;
          } else if (ev.type === "rate_limit_event") {
            const info = ev.rate_limit_info ?? {};
            res.plan = info.unifiedWindows ?? res.plan;
            if (info.status && info.status !== "allowed" && info.status !== "allowed_warning") res.rateLimited = { resetsAt: info.resetsAt ?? null };
          } else if (ev.type === "result") {
            res.text = (ev.result ?? turnText).trim();
            res.isError = !!ev.is_error;
            const u = ev.usage ?? {};
            res.tokensIn = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
            res.tokensOut = u.output_tokens ?? 0;
            const m = Object.keys(ev.modelUsage ?? {})[0];
            if (m) res.model = m;
          }
        }
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (c: string) => { errBuf += c; });
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (!res.text && !res.rateLimited && code !== 0) return reject(new Error(errBuf.trim().slice(-500) || `claude exited ${code}`));
        if (!res.rateLimited && /usage limit|rate limit|limit reached/i.test(res.text) && res.isError) res.rateLimited = { resetsAt: null };
        resolve(res);
      });
      child.stdin.end(o.prompt);
    });
  },
});
