// AI backends. Today: Claude Code headless on the Pro plan. Swap in an API backend later
// by implementing the same interface.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
  /** Build mode only: run inside the repo with file edits auto-accepted. */
  cwd?: string;
  permissionMode?: "acceptEdits";
};
export interface Backend {
  name: string;
  run(o: RunOpts): Promise<RunResult>;
}

/** Empty working directory so no CLAUDE.md or project settings leak into Apollo jobs. */
const SANDBOX = join(import.meta.dirname, ".sandbox");
const PROMPTS = join(import.meta.dirname, ".prompts");
/** One file per distinct system prompt (named by content), reused across jobs. */
function sysFile(text: string) {
  mkdirSync(PROMPTS, { recursive: true });
  let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  const f = join(PROMPTS, `system-${(h >>> 0).toString(36)}-${text.length}.txt`);
  if (!existsSync(f)) writeFileSync(f, text, "utf8");
  return f;
}

/**
 * Find Claude Code's real executable so it can be started WITHOUT a shell. On Windows the npm
 * "claude" command is a .cmd wrapper, and going through cmd.exe mangles arguments (empty values
 * vanish, newlines in the system prompt break), which silently re-enabled Claude Code's own tools.
 */
export function resolveClaude() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  if (process.platform === "win32") {
    const cands = [
      join(process.env.APPDATA ?? "", "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
      join(process.env.USERPROFILE ?? "", ".local", "bin", "claude.exe"),
      join(process.env.LOCALAPPDATA ?? "", "Programs", "claude", "claude.exe"),
    ];
    const hit = cands.find((c) => existsSync(c));
    if (hit) return hit;
    throw new Error(`Couldn't find claude.exe (looked in ${cands.join("; ")}). Set CLAUDE_BIN in .env.relay to its full path.`);
  }
  return "claude";
}

export const claudeCode = (bin = resolveClaude()): Backend => ({
  name: "claude-code",
  run(o) {
    mkdirSync(SANDBOX, { recursive: true });
    const args = [
      "-p", "--model", o.model,
      "--output-format", "stream-json", "--verbose", "--include-partial-messages",
      "--no-session-persistence",
      // via a file: exact text, no quoting problems, and the same file content keeps prompt caching
      "--system-prompt-file", sysFile(o.system),
      // No built-in tools at all (no Bash, no files, no web). Only the site's MCP tools.
      "--tools", [...new Set((o.builtins ?? []).map((b) => b.replace(/\(.*$/, "")))].join(","),
      "--strict-mcp-config",
    ];
    const allowed = [...(o.mcpConfig ? ["mcp__noesis"] : []), ...(o.builtins ?? [])];
    if (o.mcpConfig) args.push("--mcp-config", o.mcpConfig);
    if (allowed.length) args.push("--allowedTools", ...allowed);
    if (o.permissionMode) args.push("--permission-mode", o.permissionMode);
    // belt and braces: Apollo jobs never get Claude Code's own file, shell or agent tools
    if (!o.builtins?.length) args.push("--disallowedTools", "Bash", "Read", "Edit", "Write", "Glob", "Grep", "NotebookEdit", "WebFetch", "WebSearch", "Task", "TodoWrite");

    return new Promise((resolve, reject) => {
      // never through a shell (see resolveClaude)
      const child = spawn(bin, args, { cwd: o.cwd ?? SANDBOX, stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
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
