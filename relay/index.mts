// NOESIS relay: runs on the home PC. Picks Apollo jobs from the database, runs them
// through Claude Code on the Pro plan, streams the reply back, and keeps a heartbeat.
import { writeFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { getStore } from "../src/core/getStore";
import { buildUserPrompt, systemFor } from "../src/core/prompt";
import { isMode } from "../src/core/modes";
import { weeklyScores, weekStart } from "../src/core/scores";
import { ESCALATE, pickModel, type ModelPref } from "../src/core/routing";
import { nowIso, type Row, type Store } from "../src/core/store";
import { claudeCode, type Backend, type RunResult } from "./backend.mts";
import { runBuild, runRollback, runShip } from "./build.mts";

const VERSION = "0.5.0";
const HEARTBEAT_MS = 15_000;
const POLL_MS = 1_500;
const SUMMARY_EVERY = 20; // messages

const store = getStore();
if (!store) {
  console.error("Set SUPABASE_URL and SUPABASE_SECRET_KEY (see relay/README.md).");
  process.exit(1);
}
const backend: Backend = claudeCode();
let plan: RunResult["plan"] = null;
let busy = false;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function heartbeat() {
  try {
    await store!.insert("relay_status", {
      id: "main", last_heartbeat: nowIso(), version: VERSION,
      info: { host: hostname(), backend: backend.name, busy, plan, plan_at: plan ? nowIso() : null },
    });
  } catch (e) {
    log("heartbeat failed:", (e as Error).message);
  }
}

function mcpConfigFor(jobId: string) {
  const dir = join(import.meta.dirname, ".sandbox");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `mcp-${jobId}.json`);
  const tsx = join(import.meta.dirname, "..", "node_modules", "tsx", "dist", "cli.mjs");
  const env: Record<string, string> = { NOESIS_JOB_ID: jobId };
  for (const k of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "NOESIS_DEV_STORE"]) if (process.env[k]) env[k] = process.env[k]!;
  writeFileSync(path, JSON.stringify({ mcpServers: { noesis: { command: process.execPath, args: [tsx, join(import.meta.dirname, "mcp.mts")], env } } }));
  return path;
}

function throttle(fn: (s: string) => void, ms: number) {
  let last = 0, pending: string | null = null, t: NodeJS.Timeout | null = null;
  const flush = () => { if (pending !== null) { fn(pending); pending = null; last = Date.now(); } t = null; };
  return {
    push(s: string) {
      pending = s;
      if (Date.now() - last >= ms) flush();
      else if (!t) t = setTimeout(flush, ms);
    },
    done() { if (t) clearTimeout(t); flush(); },
  };
}

async function runApollo(s: Store, job: Row) {
  const { conversation_id: convId, text, model_pref = "auto", message_id } = job.input ?? {};
  const mode = isMode(job.input?.mode) ? job.input.mode : "chat";
  let pick = pickModel(model_pref as ModelPref, text);
  // tutoring and flashcard-making need a stronger model than Haiku by default
  if (pick.auto && pick.model === "haiku" && (mode === "tutor" || mode === "flashcards")) pick = { model: "sonnet", auto: true, reason: `${mode} mode` };
  const prompt = await buildUserPrompt(s, convId, text, message_id, typeof job.input?.screen === "string" ? job.input.screen : undefined);
  const mcp = mcpConfigFor(job.id);

  const attempt = async (model: string, escalatable: boolean) => {
    const stream = throttle((t) => {
      if (escalatable && ESCALATE.startsWith(t.trim().slice(0, ESCALATE.length))) return; // don't flash "ESCALATE"
      void s.update("jobs", job.id, { output: { text: t, model, streaming: true } });
    }, 250);
    const r = await backend.run({ model, system: systemFor(mode, escalatable), prompt, mcpConfig: mcp, onText: stream.push });
    stream.done();
    return r;
  };

  let r = await attempt(pick.model, pick.auto && pick.model === "haiku");
  let escalated = false;
  if (pick.auto && pick.model === "haiku" && r.text.trim() === ESCALATE) {
    await s.insert("usage_log", { job_id: job.id, feature: "apollo.route", model: r.model, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
    pick = { model: "sonnet", auto: true, reason: "Haiku escalated" };
    escalated = true;
    r = await attempt("sonnet", false);
  }
  if (r.plan) plan = r.plan;

  if (r.rateLimited) {
    const retry = r.rateLimited.resetsAt ? new Date(r.rateLimited.resetsAt * 1000).toISOString() : new Date(Date.now() + 15 * 60_000).toISOString();
    await s.update("jobs", job.id, { status: "rate_limited", retry_at: retry, error: "Plan usage limit reached", output: null });
    log("rate limited until", retry);
    return;
  }
  if (r.isError) throw new Error(r.text || "Claude returned an error");

  const msg = await s.insert("messages", {
    conversation_id: convId, role: "assistant", content: r.text, model: r.model, tokens_in: r.tokensIn, tokens_out: r.tokensOut,
  });
  await s.insert("usage_log", { job_id: job.id, feature: "apollo.chat", model: r.model, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
  await s.update("conversations", convId, { updated_at: nowIso() });
  const actions = await s.count("action_log", { eq: { job_id: job.id } });
  await s.update("jobs", job.id, {
    status: "done", finished_at: nowIso(), model: r.model,
    output: { text: r.text, model: r.model, family: pick.model, escalated, reason: pick.reason, message_id: msg.id, tokens: r.tokensIn + r.tokensOut, actions },
  });
  log(`job ${job.id.slice(0, 8)} done · ${pick.model}${escalated ? " (escalated)" : ""} · ${r.tokensIn + r.tokensOut} tok · ${actions} actions`);
  void maybeSummarise(s, convId);
}

async function maybeSummarise(s: Store, convId: string) {
  try {
    const all = await s.list("messages", { eq: { conversation_id: convId }, order: { col: "created_at", asc: true } });
    const prev = await s.get("chat_summaries", convId);
    const covered = prev ? all.findIndex((m) => m.id === prev.upto_message_id) + 1 : 0;
    const older = all.slice(covered, Math.max(covered, all.length - 10));
    if (older.length < SUMMARY_EVERY) return;
    const r = await backend.run({
      model: "haiku",
      system: "Summarise this conversation history in under 120 words: facts, decisions and open threads only.",
      prompt: `${prev?.summary ? `Earlier summary: ${prev.summary}\n\n` : ""}${older.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
    });
    await s.insert("chat_summaries", { id: convId, summary: r.text, upto_message_id: older[older.length - 1].id, updated_at: nowIso() });
    await s.insert("usage_log", { feature: "apollo.summary", model: r.model, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
    log(`summarised ${older.length} messages in ${convId.slice(0, 8)}`);
  } catch (e) {
    log("summary failed:", (e as Error).message);
  }
}

async function tick() {
  if (busy) return;
  let job: Row | null = null;
  try {
    job = await store!.claimNextJob();
    if (!job) return;
    busy = true;
    log(`job ${job.id.slice(0, 8)} ${job.kind}`);
    if (job.kind === "apollo") await runApollo(store!, job);
    else if (job.kind === "report") await runReport(store!, job);
    else if (job.kind === "research") await runResearch(store!, job);
    else if (job.kind === "build") await runBuild(store!, backend, job, log);
    else if (job.kind === "ship") await runShip(store!, job, log);
    else if (job.kind === "rollback") await runRollback(store!, job, log);
    else await store!.update("jobs", job.id, { status: "error", error: `unknown job kind ${job.kind}`, finished_at: nowIso() });
  } catch (e) {
    log("job failed:", (e as Error).message);
    if (job) await store!.update("jobs", job.id, { status: "error", error: (e as Error).message.slice(0, 500), finished_at: nowIso() }).catch(() => {});
  } finally {
    busy = false;
  }
}

/** Weekly report: scores come from code; the model only writes commentary. */
async function runReport(s: Store, job: Row) {
  const weeksAgo = Number(job.input?.weeks_ago ?? 1);
  const scores = await weeklyScores(s, weeksAgo);
  const prev = await weeklyScores(s, weeksAgo + 1);
  const compact = { week_starting: scores.week, overall: scores.overall, grade: scores.grade, areas: scores.areas, previous_week: { overall: prev.overall, areas: prev.areas.map((a) => ({ area: a.area, score: a.score })) } };
  let commentary = "";
  if (scores.overall != null) {
    const r = await backend.run({ model: "sonnet", system: systemFor("report"), prompt: JSON.stringify(compact) });
    if (r.plan) plan = r.plan;
    if (r.rateLimited) {
      await s.update("jobs", job.id, { status: "rate_limited", retry_at: new Date((r.rateLimited.resetsAt ?? Date.now() / 1000 + 900) * 1000).toISOString() });
      return;
    }
    commentary = r.text;
    await s.insert("usage_log", { job_id: job.id, feature: "report", model: r.model, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
  } else commentary = "No data was logged this week, so there are no scores.";
  const existing = (await s.list("weekly_reports", { eq: { week: scores.week }, limit: 1 }))[0];
  const data = { week: scores.week, overall: scores.overall, grade: scores.grade, scores: scores.areas, commentary, title: `Week of ${scores.week}` };
  const rep = existing ? await s.update("weekly_reports", existing.id, data) : await s.insert("weekly_reports", data);
  await s.insert("inbox_items", { source: "weekly report", title: `Weekly report: ${scores.grade ?? "no data"} (${scores.overall ?? "–"}/100)`, body: commentary.slice(0, 600), link: "/s/library", read_at: null, deleted_at: null });
  await s.update("jobs", job.id, { status: "done", finished_at: nowIso(), output: { text: commentary, report_id: rep!.id } });
  log(`report for ${scores.week} saved (${scores.grade ?? "no data"})`);
}

/** Opportunities search: the only job with web access (WebSearch/WebFetch) — still no shell or files. */
async function runResearch(s: Store, job: Row) {
  const facts = await s.list("profile_facts", { limit: 40 });
  const prompt = `Find 5-8 current extracurricular and super-curricular opportunities in the UK for an A-level student (competitions, olympiads, summer schools, essay prizes, MOOCs, lectures, work experience) relevant to: ${facts.map((f) => `${f.key}: ${f.value}`).join("; ")}.
Rules: every item needs the real page url you found it on; only give a deadline if that page states it; skip anything paid or closed; no duplicates of what list_records(table "opportunities") already has. Save them with save_opportunities, then reply with one line saying how many you saved.`;
  const r = await backend.run({ model: "sonnet", system: systemFor("chat"), prompt, mcpConfig: mcpConfigFor(job.id), builtins: ["WebSearch", "WebFetch"], timeoutMs: 10 * 60_000 });
  if (r.plan) plan = r.plan;
  await s.insert("usage_log", { job_id: job.id, feature: "opportunities", model: r.model, tokens_in: r.tokensIn, tokens_out: r.tokensOut });
  await s.update("jobs", job.id, { status: r.isError ? "error" : "done", finished_at: nowIso(), output: { text: r.text }, error: r.isError ? r.text : null });
  log(`opportunities: ${r.text.slice(0, 80)}`);
}

/** Weekly schedule (local time): report for the past week on Monday from 07:00; opportunities on Sunday from 18:00. */
async function schedule() {
  try {
    const now = new Date();
    const settings = (await store!.get("settings", "main")) ?? (await store!.insert("settings", { id: "main", theme_id: "midnight", data: {} }));
    const data = settings.data ?? {};
    const thisWeek = weekStart(0).toISOString().slice(0, 10);
    const queue = async (kind: string, input: object, key: string) => {
      await store!.insert("jobs", { kind, status: "queued", input, ui_actions: [], output: null });
      await store!.update("settings", "main", { data: { ...((await store!.get("settings", "main"))?.data ?? {}), [key]: thisWeek } });
      log(`scheduled ${kind}`);
    };
    if (now.getDay() >= 1 && (now.getDay() > 1 || now.getHours() >= 7) && data.last_report_week !== thisWeek && data.auto_report !== false) await queue("report", { weeks_ago: 1 }, "last_report_week");
    if (now.getDay() === 0 && now.getHours() >= 18 && data.last_opps_week !== thisWeek && data.auto_opportunities !== false) await queue("research", { topic: "opportunities" }, "last_opps_week");
  } catch (e) {
    log("schedule failed:", (e as Error).message);
  }
}

log(`NOESIS relay ${VERSION} · ${store.kind} store · ${backend.name}`);
await heartbeat();
setInterval(heartbeat, HEARTBEAT_MS);
setInterval(tick, POLL_MS);
void schedule();
setInterval(schedule, 10 * 60_000);
