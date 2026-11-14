// PC control: Apollo can run commands on Reg's PC (PowerShell), open apps/sites/files, and control media.
// Safe commands run at once. Anything that looks risky (deleting, killing, installing, system settings,
// network downloads, writing files...) becomes an approval card in the chat: it only runs after Reg's click.
// These tools exist only in the relay's tool server (on the PC), never on the website.
import { spawn } from "node:child_process";
import { z } from "zod";
import { nowIso, type Row, type Store } from "../src/core/store";

const win = process.platform === "win32";

/** Patterns that always need Reg's OK, whatever Apollo thinks. */
const RISKY: [RegExp, string][] = [
  [/\b(remove-item|rm|rmdir|rd|del|erase|clear-content|clear-item|clear-recyclebin)\b/i, "deletes files"],
  [/\b(format(-volume)?|diskpart|bcdedit|cipher|chkdsk|initialize-disk|clear-disk)\b/i, "changes disks or boot settings"],
  [/\b(stop-computer|restart-computer|shutdown|logoff|suspend)\b/i, "shuts down, restarts or logs off"],
  [/\b(stop-process|taskkill|kill)\b/i, "closes programs (unsaved work could be lost)"],
  [/\b(reg(\.exe)?\s+(add|delete|import)|set-itemproperty|new-itemproperty|remove-itemproperty|hklm:|hkcu:)/i, "edits the registry"],
  [/\b(set-executionpolicy|set-mppreference|netsh|set-netfirewall|new-netfirewallrule|disable-|enable-|set-service|stop-service|sc(\.exe)?\s|schtasks|new-service)/i, "changes system or security settings"],
  [/\b(winget|choco|scoop|msiexec|uninstall|install-package|install-module|npm\s+(i|install|uninstall)|pip\s+(install|uninstall))\b/i, "installs or uninstalls software"],
  [/\b(invoke-webrequest|iwr|invoke-restmethod|irm|curl|wget|start-bitstransfer|downloadstring|downloadfile)\b/i, "downloads from the internet"],
  [/\b(invoke-expression|iex|encodedcommand|-enc\b|frombase64string|add-type)\b/i, "runs code it builds at runtime"],
  [/(-verb\s+runas|\brunas\b|start-process[^|;]*-verb)/i, "asks for admin rights"],
  [/\b(move-item|mv|rename-item|ren|set-content|add-content|out-file|copy-item|cp|new-item)\b|(^|[^>])>{1,2}\s*[^&\s]/i, "creates, moves or overwrites files"],
  [/\b(net\s+user|icacls|takeown|get-credential|convertfrom-securestring|cmdkey|vaultcmd)\b/i, "touches accounts, permissions or passwords"],
  [/\b(git\s+(push|reset|clean|checkout\s+--|rebase))\b/i, "changes a git repository"],
  [/\.env\b|password|secret|token|api[_-]?key/i, "touches secrets"],
  [/\b(ri|rni|spps|mi|move|cpi|copy|ni|ac|rmdir)\s/i, "creates, moves, deletes or closes things (short command alias)"],
  [/\[(system\.)?(io\.(file|directory)|diagnostics\.process|environment)\]::/i, "calls file or process APIs directly"],
];
export function riskOf(command: string): string | null {
  for (const [re, why] of RISKY) if (re.test(command)) return why;
  return null;
}

/** Run PowerShell (Windows) or sh (elsewhere) and capture the output. */
export function runCommand(command: string, timeoutMs = 60_000): Promise<{ ok: boolean; code: number | null; out: string }> {
  return new Promise((resolve) => {
    const child = win
      ? spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command], { windowsHide: true })
      : spawn("sh", ["-c", command]);
    let out = "";
    const add = (d: Buffer) => { out += d.toString(); if (out.length > 200_000) out = out.slice(-100_000); };
    child.stdout.on("data", add); child.stderr.on("data", add);
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      if (win && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }).on("error", () => {});
      else child.kill("SIGKILL");
      resolve({ ok: false, code: null, out: `${out.trim()}\n(stopped after ${timeoutMs / 1000}s)`.slice(-8000) });
    }, timeoutMs);
    child.on("error", (e) => { if (done) return; done = true; clearTimeout(t); resolve({ ok: false, code: null, out: String(e) }); });
    child.on("close", (code) => { if (done) return; done = true; clearTimeout(t); resolve({ ok: code === 0, code, out: out.trim().slice(-8000) || "(no output)" }); });
  });
}

const psQuote = (s: string) => `'${s.replace(/'/g, "''")}'`;
const MEDIA: Record<string, number> = { play_pause: 0xb3, next: 0xb0, previous: 0xb1, stop: 0xb2, mute: 0xad, volume_up: 0xaf, volume_down: 0xae };
const mediaCmd = (vk: number, times = 1) =>
  `$s=Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void keybd_event(byte k,byte s,uint f,UIntPtr e);' -Name K -Namespace W -PassThru; 1..${times} | % { $s::keybd_event(${vk},0,1,[UIntPtr]::Zero); $s::keybd_event(${vk},0,3,[UIntPtr]::Zero) }`;

type Ctx = { store: Store; jobId: string | null };

/** Ask Reg: an approval card in the chat. The relay runs it after his click and posts the result back. */
async function askFirst(ctx: Ctx, command: string, why: string, risk: string) {
  const parent = ctx.jobId ? await ctx.store.get("jobs", ctx.jobId) : null;
  const job = await ctx.store.insert("jobs", {
    kind: "pc", status: "proposed", ui_actions: [], output: { step: "Waiting for your OK" },
    input: { command, why, risk, conversation_id: parent?.input?.conversation_id ?? null, from_job: ctx.jobId },
  });
  return { needs_approval: true, id: job.id, risk, note: `Not run yet: it ${risk}. Reg sees an Allow / Deny card in the chat; it runs only if he allows it, and the result is posted to this chat. Tell him briefly what it will do.` };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PC_TOOLS: { name: string; description: string; input: z.ZodRawShape; run: (ctx: Ctx, a: any) => Promise<unknown> }[] = [
  {
    name: "pc_run",
    description: "Run a PowerShell command on Reg's Windows PC and get its output (anything: open apps, find files, check system info, control windows, automate tasks). Safe, read-only or launch commands run immediately. Anything risky (deleting, closing programs, installing, downloading, registry/system/security settings, writing or moving files, admin rights, secrets) is NOT run: Reg gets an Allow/Deny card first. Set risky=true yourself whenever in doubt. Keep commands non-interactive. Prefer one clear command over many.",
    input: { command: z.string().min(1).max(8000), why: z.string().max(300).describe("One line for Reg: what this does"), risky: z.boolean().optional() },
    async run(ctx: Ctx, a: { command: string; why: string; risky?: boolean }) {
      const risk = riskOf(a.command) ?? (a.risky ? "was flagged as risky by Apollo" : null);
      if (risk) return askFirst(ctx, a.command, a.why, risk);
      const r = await runCommand(a.command);
      await ctx.store.insert("action_log", { actor: "apollo", tool: "pc_run", table_name: null, row_id: null, before: null, after: { command: a.command, ok: r.ok, out: r.out.slice(0, 2000) } }).catch(() => null);
      return r;
    },
  },
  {
    name: "pc_open",
    description: "Open something on Reg's PC: a website URL, an app by name or path (e.g. 'spotify', 'discord', 'code', 'notepad', 'steam://rungameid/...'), a file or a folder. For 'search YouTube for X' open https://www.youtube.com/results?search_query=X; for Spotify use spotify:search:X.",
    input: { target: z.string().min(1).max(2000) },
    async run(_ctx: Ctx, a: { target: string }) {
      const t = a.target.trim();
      const r = await runCommand(win ? `Start-Process ${psQuote(t)}` : `xdg-open ${JSON.stringify(t)}`, 20_000);
      if (r.ok || !win) return { opened: t, ...r };
      // not found by name: try the Start menu (Store and installed apps)
      const app = await runCommand(`$a = Get-StartApps | Where-Object { $_.Name -like ${psQuote(`*${t}*`)} } | Select-Object -First 1; if ($a) { Start-Process ("shell:AppsFolder\\" + $a.AppID); "opened " + $a.Name } else { throw "No app called ${t.replace(/"/g, "")}" }`, 20_000);
      return { opened: app.ok ? t : null, ...app };
    },
  },
  {
    name: "pc_media",
    description: "Media and volume keys on Reg's PC: play_pause, next, previous, stop, mute, volume_up, volume_down (times = how many steps, each about 2%).",
    input: { key: z.enum(["play_pause", "next", "previous", "stop", "mute", "volume_up", "volume_down"]), times: z.number().int().min(1).max(50).optional() },
    async run(_ctx: Ctx, a: { key: keyof typeof MEDIA; times?: number }) {
      if (!win) return { error: "media keys only work on Windows" };
      return runCommand(mediaCmd(MEDIA[a.key], a.times ?? 1), 15_000);
    },
  },
];

/** The relay runs an approved PC command and posts the result to the chat it came from. */
export async function runPcJob(s: Store, job: Row) {
  if (job.input?.approved_by !== "reg") throw new Error("PC commands that need approval only run after Reg allows them.");
  const r = await runCommand(String(job.input.command), 5 * 60_000);
  await s.update("jobs", job.id, { status: r.ok ? "done" : "error", finished_at: nowIso(), output: { step: r.ok ? "Done" : "Failed", ...r }, error: r.ok ? null : r.out.slice(-500) });
  await s.insert("action_log", { actor: "reg", tool: "pc_run", table_name: null, row_id: null, before: null, after: { command: job.input.command, ok: r.ok, out: r.out.slice(0, 2000) } }).catch(() => null);
  if (job.input.conversation_id) await s.insert("messages", { conversation_id: job.input.conversation_id, role: "assistant", content: `${r.ok ? "✓ Done" : "✗ That failed"}: ${job.input.why ?? job.input.command}${r.out && r.out !== "(no output)" ? `\n${r.out.slice(0, 1500)}` : ""}` }).catch(() => null);
}
