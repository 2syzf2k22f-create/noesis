"use client";
// Build mode: ask for a change to the site's own code. The relay on your PC makes it in a clean
// copy, checks it builds, pushes a branch (Vercel previews it); you Ship it or Roll back.
// Sections: waiting for your OK, the queue (with progress), ready to ship, cancelled, history.

import { useEffect, useMemo, useState } from "react";
import u from "./ui.module.css";

type B = {
  id: string; status: string; request: string; title?: string | null; proposed?: boolean; at: string; finished?: string | null;
  step?: string; branch?: string; summary?: string; diffstat?: string; note?: string | null; shipped?: boolean; shipped_at?: string; rolled_back?: boolean; error?: string | null;
};
const field: React.CSSProperties = { width: "100%", padding: 10, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", font: "14px var(--font-body)" };
const STAGES = ["Queued", "Preparing", "Making the change", "Checking", "Ready to ship", "Publishing", "Live"];
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

/** Where a build is on its way to being published (0-6). */
function stage(b: B, now: number) {
  if (b.shipped) return b.shipped_at && now - Date.parse(b.shipped_at) < 3 * 60e3 ? 5 : 6;
  if (b.step?.startsWith("Shipping")) return 5;
  if (b.status === "done") return 4;
  const st = b.step ?? "";
  if (/check|fixing/i.test(st)) return 3;
  if (/making the change/i.test(st)) return 2;
  if (/preparing|creating branch/i.test(st)) return 1;
  return 0;
}

function Progress({ b, now }: { b: B; now: number }) {
  const i = stage(b, now);
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, 1fr)`, gap: 3 }}>
        {STAGES.map((s, k) => <i key={s} title={s} style={{ height: 6, borderRadius: 3, background: k < i ? "var(--accent)" : k === i ? "color-mix(in srgb, var(--accent) 55%, transparent)" : "var(--surface-2)", animation: k === i && i < 6 ? "pulse 1.2s infinite alternate" : undefined }} />)}
      </div>
      <small className="label">{STAGES[i]}{i === 5 ? " · Vercel is deploying it (about 2 minutes)" : i === 6 ? " · on the live site" : b.step && i > 0 && i < 4 ? ` · ${b.step}` : i === 0 ? " · waiting for the relay on your PC" : ""}</small>
    </div>
  );
}

function Item({ b, children, progress, now, open, onToggle }: { b: B; children?: React.ReactNode; progress?: boolean; now: number; open: boolean; onToggle: () => void }) {
  return (
    <li style={{ padding: 12, borderRadius: 10, background: "var(--surface)", display: "grid", gap: 6 }}>
      <div className={u.row}>
        <b style={{ flex: 1 }}>{b.title || (b.request.length > 140 ? `${b.request.slice(0, 140)}…` : b.request)}</b>
        {b.proposed && <span className="label">Apollo&apos;s idea</span>}
      </div>
      <small className="label">{when(b.at)}{b.branch ? ` · ${b.branch}` : ""}{b.diffstat ? ` · ${b.diffstat}` : ""}{b.shipped_at ? ` · shipped ${when(b.shipped_at)}` : ""}</small>
      {progress && <Progress b={b} now={now} />}
      {b.status === "error" && b.error && <small style={{ color: "var(--danger)", whiteSpace: "pre-wrap" }}>{b.error.slice(0, 400)}</small>}
      <div className={u.row}>
        {children}
        <button className="pill" onClick={onToggle}>{open ? "Hide details" : "Details"}</button>
      </div>
      {open && (
        <div style={{ display: "grid", gap: 6, fontSize: 12.5 }}>
          <div><span className="label">Request</span><div style={{ whiteSpace: "pre-wrap" }}>{b.request}</div></div>
          {b.summary && <div><span className="label">What changed</span><div style={{ whiteSpace: "pre-wrap" }}>{b.summary}</div></div>}
          {b.note && <div className="label">{b.note}</div>}
        </div>
      )}
    </li>
  );
}

function Section({ title, items, empty, children, collapsed, extra }: { title: string; items: B[]; empty?: string; children: (b: B) => React.ReactNode; collapsed?: { open: boolean; toggle: () => void }; extra?: React.ReactNode }) {
  if (!items.length && !empty) return null;
  return (
    <section style={{ display: "grid", gap: 6 }}>
      <div className={u.row}>
        {collapsed ? <button className="pill" onClick={collapsed.toggle}>{collapsed.open ? "▾" : "▸"} {title} ({items.length})</button> : <span className="label">{title} ({items.length})</span>}
        {extra}
      </div>
      {collapsed && !collapsed.open ? null : items.length ? <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>{items.map(children)}</ul> : <small className="label">{empty}</small>}
    </section>
  );
}

export function BuildBlock() {
  const [d, setD] = useState<{ onHold?: boolean; autoShip: boolean; relayOnline: boolean; builds: B[] } | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const load = () => fetch("/api/build").then((r) => (r.ok ? r.json() : null)).then((j) => { setD(j); setNow(Date.now()); }).catch(() => {});
  useEffect(() => { void load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  const act = async (id: string, action: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const r = await fetch(`/api/build/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).then((x) => x.json()).catch(() => null);
    setErr(r?.error ?? null);
    void load();
  };
  const all = useMemo(() => (d?.builds ?? [])
    .filter((b) => !q.trim() || `${b.title ?? ""} ${b.request} ${b.summary ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())), [d, q]);
  if (!d) return <div className="label">Loading…</div>;
  const waiting = all.filter((b) => b.status === "proposed");
  const queue = all.filter((b) => b.status === "queued" || b.status === "running").reverse(); // oldest first = next up
  const ready = all.filter((b) => b.status === "done" && !b.shipped && !b.rolled_back);
  const old = all.filter((b) => b.status === "cancelled" || b.status === "error");
  const history = all.filter((b) => b.shipped || b.rolled_back);
  const clear = async () => { const r = await fetch("/api/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear" }) }).then((x) => x.json()).catch(() => null); setErr(r?.deleted != null ? null : r?.error ?? "Couldn't clear."); void load(); };
  const del = (b: B) => <button className="pill" onClick={() => act(b.id, "delete")} title="Moves it to the trash (restorable for 30 days)">🗑 Delete</button>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {d.onHold && <div className="panel" style={{ padding: 12, borderLeft: "3px solid var(--danger)" }}><b>Build mode is on hold.</b> <span className="label">No new builds start. You can still ship, discard or revert existing ones, and clear old ones out. For code changes, ask Claude Code directly.</span></div>}
      {!d.onHold && <div style={{ display: "grid", gap: 8 }}>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Describe a change to NOESIS, e.g. Add a 'protein per meal' chart to the Nutrition overview" style={field} />
        <div className={u.row}>
          <button className="pill" data-active="true" disabled={text.trim().length < 5} onClick={async () => { await fetch("/api/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: text }) }); setText(""); void load(); }}>Build it</button>
          <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={d.autoShip} onChange={async (e) => { await fetch("/api/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ autoShip: e.target.checked }) }); void load(); }} />
            Auto-ship small changes (≤ 40 lines)
          </label>
          <span className="label" style={{ color: d.relayOnline ? "var(--good)" : "var(--danger)" }}>● Relay {d.relayOnline ? "online" : "offline: builds wait in the queue"}</span>
        </div>
      </div>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search requests…" style={{ ...field, height: 38, padding: "0 12px" }} />
      {err && <div className="label" style={{ color: "var(--danger)" }}>{err}</div>}

      <Section title="Waiting for your OK" items={d.onHold ? [] : waiting}>{(b) => (
        <Item key={b.id} now={now} open={open === b.id} onToggle={() => setOpen(open === b.id ? null : b.id)} b={b}><button className="pill" data-active="true" onClick={() => act(b.id, "approve")}>Build it</button><button className="pill" onClick={() => act(b.id, "decline")}>No thanks</button></Item>
      )}</Section>

      <Section title="Queue" items={queue} empty="Nothing building.">{(b) => (
        <Item key={b.id} now={now} open={open === b.id} onToggle={() => setOpen(open === b.id ? null : b.id)} b={b} progress>{b.status === "queued" && <button className="pill" onClick={() => act(b.id, "cancel")}>✕ Cancel</button>}</Item>
      )}</Section>

      <Section title="Ready to ship" items={ready}>{(b) => (
        <Item key={b.id} now={now} open={open === b.id} onToggle={() => setOpen(open === b.id ? null : b.id)} b={b} progress>
          <button className="pill" data-active="true" onClick={() => act(b.id, "ship")}>Ship it</button>
          <button className="pill" onClick={() => act(b.id, "rollback", "Discard this build? Its branch will be deleted.")}>Discard</button>
        </Item>
      )}</Section>

      <Section title="History" items={history} empty="No builds shipped yet.">{(b) => (
        <Item key={b.id} now={now} open={open === b.id} onToggle={() => setOpen(open === b.id ? null : b.id)} b={b} progress={!!b.shipped && !b.rolled_back}>
          <span className="pill" data-active={!!b.shipped && !b.rolled_back}>{b.rolled_back ? (b.shipped ? "reverted" : "discarded") : "live"}</span>
          {b.shipped && !b.rolled_back && <button className="pill" onClick={() => act(b.id, "rollback", "Revert this change on the live site?")}>↶ Revert</button>}
          {del(b)}
        </Item>
      )}</Section>

      <Section title="Failed and cancelled" items={old} collapsed={{ open: showOld, toggle: () => setShowOld(!showOld) }}
        extra={old.length > 0 && <button className="pill" onClick={clear} title="Moves them all to the trash (restorable for 30 days)">Clear failed and cancelled</button>}>{(b) => (
        <Item key={b.id} now={now} open={open === b.id} onToggle={() => setOpen(open === b.id ? null : b.id)} b={b}>
          <span className="pill">{b.status === "error" ? "failed" : "cancelled"}</span>
          {!d.onHold && b.status === "cancelled" && b.step !== "Declined" && <button className="pill" data-active="true" onClick={() => act(b.id, "requeue")}>↻ Requeue</button>}
          {!d.onHold && b.status === "error" && <button className="pill" data-active="true" onClick={() => act(b.id, "retry")}>↻ Retry</button>}
          {del(b)}
        </Item>
      )}</Section>
      <small className="label">Only requests you type here, chat messages starting &ldquo;build:&rdquo;, or Apollo&apos;s proposals you approve can start a build. Declined proposals aren&apos;t shown.</small>
    </div>
  );
}
