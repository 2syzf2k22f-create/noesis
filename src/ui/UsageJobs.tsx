"use client";
// Stats > Apollo usage > Recent jobs: what each job actually was (what you asked, what Apollo replied,
// which tools it ran, which chat), with filters, sorting and a details panel.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const fmt = (n: unknown) => (n == null ? "–" : Number(n).toLocaleString("en-GB"));
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const field: React.CSSProperties = { height: 32, padding: "0 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "13px var(--font-body)" };

export function UsageJobs({ ctx }: { ctx: BlockCtx }) {
  const rows = (ctx.data?.rows ?? []) as Row[];
  const [feature, setFeature] = useState("");
  const [model, setModel] = useState("");
  const [minTok, setMinTok] = useState("");
  const [sort, setSort] = useState<"new" | "tokens">("new");
  const [open, setOpen] = useState<Row | null>(null);
  const features = useMemo(() => [...new Set(rows.map((r) => r.feature).filter(Boolean))].sort(), [rows]);
  const models = useMemo(() => [...new Set(rows.map((r) => r.model).filter(Boolean))].sort(), [rows]);
  const shown = useMemo(() => rows
    .filter((r) => (!feature || r.feature === feature) && (!model || r.model === model) && (!minTok || Number(r.tokens_total ?? 0) > Number(minTok)))
    .sort((a, b) => (sort === "tokens" ? Number(b.tokens_total ?? 0) - Number(a.tokens_total ?? 0) : String(b.created_at).localeCompare(String(a.created_at)))), [rows, feature, model, minTok, sort]);
  if (ctx.data?.error) return <div className={u.nodata}>{ctx.data.error}</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className={u.row}>
        <select value={feature} onChange={(e) => setFeature(e.target.value)} style={field}><option value="">All features</option>{features.map((f) => <option key={f}>{f}</option>)}</select>
        <select value={model} onChange={(e) => setModel(e.target.value)} style={field}><option value="">All models</option>{models.map((m) => <option key={m}>{m}</option>)}</select>
        <input value={minTok} onChange={(e) => setMinTok(e.target.value.replace(/\D/g, ""))} placeholder="Tokens greater than…" style={{ ...field, width: 170 }} />
        <button className="pill" data-active={sort === "new"} onClick={() => setSort("new")}>Newest</button>
        <button className="pill" data-active={sort === "tokens"} onClick={() => setSort("tokens")}>Most tokens</button>
        <small className="label">{shown.length} of {rows.length} jobs</small>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className={u.table} style={{ width: "100%", fontSize: 12.5 }}>
          <thead><tr><th>When</th><th>Feature</th><th>What it was</th><th>Model</th><th style={{ textAlign: "right" }}>Tokens</th><th style={{ textAlign: "right" }}>7d %</th><th style={{ textAlign: "right" }}>Time</th><th /></tr></thead>
          <tbody>
            {shown.slice(0, 150).map((r) => (
              <tr key={r.id} onClick={() => setOpen(r)} style={{ cursor: "pointer" }}>
                <td style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</td>
                <td>{r.feature}</td>
                <td style={{ maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.prompt_preview ?? <span className="label">–</span>}</td>
                <td>{r.model}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: Number(r.tokens_in ?? 0) > 200_000 ? "var(--danger)" : undefined }}>{fmt(r.tokens_total)}</td>
                <td style={{ textAlign: "right" }}>{r.plan_7d_delta ?? "–"}</td>
                <td style={{ textAlign: "right" }}>{r.duration_ms ? `${Math.round(r.duration_ms / 1000)}s` : "–"}</td>
                <td><button className="pill" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>Details</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && <JobDetail r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function JobDetail({ r, onClose }: { r: Row; onClose: () => void }) {
  const [full, setFull] = useState(false);
  const has = r.prompt_preview || r.reply_preview || r.tools_used || r.conversation_id;
  const tools = Object.entries((r.tools_used ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]);
  const big = Number(r.tokens_in ?? 0) > 200_000;
  const kv = (k: string, v: React.ReactNode) => <div style={{ display: "flex", gap: 8 }}><span className="label" style={{ minWidth: 120 }}>{k}</span><span>{v}</span></div>;
  return (
    <div role="dialog" aria-label="Job details" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ width: "min(720px, 100%)", maxHeight: "85vh", overflow: "auto", padding: 18, display: "grid", gap: 12, background: "var(--bg)" }}>
        <div className={u.row}><b style={{ flex: 1 }}>{r.feature} · {when(r.created_at)}</b><button className="pill" onClick={onClose}>Close</button></div>
        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
          {kv("Model", r.model)}
          {kv("Duration", r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)} s` : "–")}
          {kv("Plan used", `7-day +${r.plan_7d_delta ?? "–"}% · 5-hour +${r.plan_5h_delta ?? "–"}%`)}
          {kv("Tokens", `${fmt(r.tokens_in)} in · ${fmt(r.tokens_out)} out · ${fmt(r.tokens_total)} total`)}
          {r.history_messages != null && kv("History resent", `${r.history_messages} earlier message${r.history_messages === 1 ? "" : "s"}`)}
          {r.page && kv("Page", r.page)}
        </div>
        {big && <div className="label" style={{ color: "var(--danger)" }}>Large input: the conversation history and tool results were resent on every step. Start a new chat to reduce this.</div>}
        {!has ? <div className="label">No details were stored for this job (it ran before job details were added).</div> : <>
          {r.prompt_preview && <div><span className="label">What you asked</span><div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{full ? r.prompt_preview : String(r.prompt_preview).slice(0, 280)}{!full && String(r.prompt_preview).length > 280 && <button className="pill" onClick={() => setFull(true)}>Show full</button>}</div></div>}
          {r.reply_preview && <div><span className="label">What Apollo replied</span><div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{r.reply_preview}</div></div>}
          {tools.length > 0 && <div><span className="label">Tools called</span><div className={u.row} style={{ flexWrap: "wrap" }}>{tools.map(([n, c]) => <span key={n} className="pill">{n} ×{c}</span>)}</div></div>}
          {r.error && <div><span className="label" style={{ color: "var(--danger)" }}>Error</span><div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{r.error}</div></div>}
          {r.conversation_id && <Link className="pill" href={`/s/chats?c=${r.conversation_id}`} style={{ justifySelf: "start" }}>Open conversation</Link>}
        </>}
      </div>
    </div>
  );
}
