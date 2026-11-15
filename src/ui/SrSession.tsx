"use client";
// The shared review session: every spaced-repetition session on NOESIS runs here, so every one gets the
// same always-visible "End session" button (Esc / Ctrl+E), pause/resume, undo (Z), 1-4 ratings, Space to
// flip, suspend/edit/ask Apollo, in-session learning steps ("repeat until right") and the summary screen.
// Ending early keeps every answer given; unanswered items are left exactly as they were.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApollo } from "@/shell/apollo";
import { RichText } from "./RichText";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const api = (body: object) => fetch("/api/sr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
const RATINGS = [[1, "Again", "#e5484d"], [2, "Hard", "#f5a524"], [3, "Good", "#30a46c"], [4, "Easy", "#5b8def"]] as const;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const KIND_LABEL: Record<string, string> = { flashcard: "Flashcard", mistake: "Mistake", question: "Question", spec: "Spec point", geo: "Geography", puzzle: "Puzzle", opening: "Opening" };
export type SrFilter = { area?: string; kind?: string; deck?: string; direction?: string; region?: string; limit?: number; title?: string };
const nowMs = () => Date.now();
const Portal = ({ children }: { children: React.ReactNode }) => (typeof document === "undefined" ? null : createPortal(children, document.body));

export function SrSession({ filter, onClose }: { filter: SrFilter; onClose: () => void }) {
  const { submit } = useApollo();
  const [queue, setQueue] = useState<A[] | null>(null);
  const [i, setI] = useState(0);
  const [sid, setSid] = useState<string | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ ok: boolean; correct: string } | null>(null);
  const [log, setLog] = useState<{ review_id: string; item: A; rating: number; again: boolean }[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [summary, setSummary] = useState<A>(null);
  const [settings, setSettings] = useState<A>({ confirm_end: true, esc_ends: true });
  const [editing, setEditing] = useState<{ front: string; back: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const t0 = useRef(0);
  const started = useRef(0);
  const qs = useMemo(() => new URLSearchParams(Object.entries({ view: "queue", ...filter }).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString(), [filter]);

  const load = useCallback(async (resume?: A) => {
    const st = await fetch("/api/sr?view=status").then((r) => r.json()).catch(() => null);
    if (st?.settings) setSettings(st.settings);
    if (resume?.state?.queue?.length) {
      const j = await fetch(`/api/sr?${qs}&limit=500`).then((r) => r.json());
      const byId = new Map((j.items ?? []).map((x: A) => [x.id, x]));
      setQueue(resume.state.queue.map((id: string) => byId.get(id)).filter(Boolean));
      setI(0); setSid(resume.id); await api({ action: "session_resume", id: resume.id });
    } else {
      const j = await fetch(`/api/sr?${qs}`).then((r) => r.json());
      setQueue(j.items ?? []);
      const s = await api({ action: "session_start", area: filter.area ?? null, kind: filter.kind ?? null, deck: filter.deck ?? null, mode: filter.kind ? "focused" : "mixed", planned: (j.items ?? []).length });
      setSid(s.id);
    }
    started.current = nowMs(); t0.current = nowMs();
  }, [qs, filter.area, filter.kind, filter.deck]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const cur = queue?.[i] ?? null;
  const answered = log.length;
  const auto = cur?.kind === "geo";
  const grade = async (rating: number, extra: A = {}) => {
    if (!cur || busy) return;
    setBusy(true);
    const ms = nowMs() - t0.current;
    const r = await api({ action: "review", item_id: cur.id, rating: extra.correct == null ? rating : undefined, correct: extra.correct, response_ms: ms, session_id: sid, answer: extra.answer, confused_with: extra.confused_with, mode: cur.direction || cur.kind });
    setBusy(false);
    if (r.error) return;
    const again = r.again_in_session || r.rating === 1;
    setLog((l) => [...l, { review_id: r.review_id, item: cur, rating: r.rating, again }]);
    window.dispatchEvent(new Event("noesis:sr-reviewed"));
    // repeat until right: missed / still-learning items come back a few cards later in this session
    if (again) setQueue((q) => { const n = [...(q ?? [])]; n.splice(Math.min(n.length, i + 4), 0, { ...cur, state: "learning" }); return n; });
    next();
  };
  const next = () => { setFlipped(false); setTyped(""); setResult(null); setEditing(null); setI((x) => x + 1); t0.current = nowMs(); };
  const finish = useCallback(async (reason: "finished" | "ended_early") => {
    if (sid) await api({ action: "session_end", id: sid, end_reason: reason });
    if (!log.length) { onClose(); return; }
    const right = log.filter((x) => x.rating > 1).length;
    setSummary({ reason, answered: log.length, accuracy: Math.round((right / log.length) * 100), minutes: Math.max(1, Math.round((nowMs() - started.current) / 60000)), lapsed: [...new Map(log.filter((x) => x.rating === 1).map((x) => [x.item.id, x.item])).values()], left: Math.max(0, (queue?.length ?? 0) - i) });
  }, [sid, log, onClose, queue, i]);
  const pause = async () => { if (sid) await api({ action: "session_pause", id: sid, queue: (queue ?? []).slice(i).map((x: A) => x.id), index: 0 }); onClose(); };
  const undo = async () => {
    const last = log[log.length - 1]; if (!last) return;
    await api({ action: "undo", review_id: last.review_id });
    setLog((l) => l.slice(0, -1));
    setQueue((q) => { const n = [...(q ?? [])]; if (last.again) { const k = n.findIndex((x, j) => j > i - 1 && x.id === last.item.id && x.state === "learning"); if (k >= 0) n.splice(k, 1); } return n; });
    setI((x) => Math.max(0, x - 1)); setFlipped(false); setResult(null); setTyped("");
  };
  const end = () => { if (!answered) { void finish("ended_early"); return; } if (settings.confirm_end) setConfirm(true); else void finish("ended_early"); };
  const done = queue != null && i >= queue.length && !summary;
  useEffect(() => { if (done) queueMicrotask(() => void finish("finished")); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  // other parts of the site (Apollo: "end this session") can end it
  useEffect(() => { const f = () => end(); window.addEventListener("noesis:end-session", f); return () => window.removeEventListener("noesis:end-session", f); });
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input,textarea");
      if ((e.key === "Escape" && settings.esc_ends) || (e.ctrlKey && e.key.toLowerCase() === "e")) { e.preventDefault(); if (confirm) setConfirm(false); else end(); return; }
      if (summary || confirm || typing || !cur) return;
      if (e.key === " " && !auto) { e.preventDefault(); setFlipped(true); }
      else if (e.key === "Enter" && !auto && !flipped) setFlipped(true);
      else if (e.key === "Enter" && auto && result) void grade(result.ok ? 3 : 1, { correct: result.ok, answer: typed, confused_with: result.ok ? null : typed });
      else if (flipped && ["1", "2", "3", "4"].includes(e.key)) void grade(Number(e.key));
      else if (e.key.toLowerCase() === "z") void undo();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const shell = (body: React.ReactNode) => (
    <Portal>
      <div role="dialog" aria-label="Review session" style={{ position: "fixed", inset: 0, zIndex: 320, background: "var(--bg)", display: "grid", gridTemplateRows: "auto 1fr", overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px max(12px, 3vw)", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <b style={{ flex: 1, minWidth: 120 }}>{filter.title ?? "Review"}</b>
          {queue && !summary && <small className="label">{Math.min(i + 1, queue.length)}/{queue.length} · {answered} answered · {queue.slice(i).filter((x: A) => x.state === "new").length} new · {queue.slice(i).filter((x: A) => x.state === "learning" || x.state === "relearning").length} learning</small>}
          {!summary && <>
            <button className="pill" onClick={undo} disabled={!log.length} title="Undo last answer (Z)">↶ Undo</button>
            <button className="pill" onClick={pause} title="Pause: come back to this exact queue later">⏸ Pause</button>
            <button className="pill" data-active="true" onClick={end} title="End session (Esc or Ctrl+E)" style={{ background: "var(--danger)", borderColor: "var(--danger)", color: "#fff" }}>■ End session</button>
          </>}
        </div>
        {queue && !summary && <div style={{ position: "absolute", top: 52, left: 0, right: 0, height: 3, background: "var(--surface-2)" }}><div style={{ width: `${queue.length ? (Math.min(i, queue.length) / queue.length) * 100 : 0}%`, height: "100%", background: "var(--accent)" }} /></div>}
        <div style={{ overflowY: "auto", padding: "18px max(12px, 4vw)", display: "grid", alignContent: "start", justifyItems: "center" }}>{body}</div>
        {confirm && (
          <div onClick={() => setConfirm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 330 }}>
            <div onClick={(e) => e.stopPropagation()} className="panel" style={{ padding: 18, display: "grid", gap: 10, background: "var(--bg)", maxWidth: 380 }}>
              <b>End now? {answered} of {queue?.length ?? 0} answered.</b>
              <small className="label">Everything you&apos;ve answered is saved. Items you haven&apos;t reached stay due as they were.</small>
              <div className={u.row}><button className="pill" data-active="true" autoFocus onClick={() => { setConfirm(false); void finish("ended_early"); }}>End session</button><button className="pill" onClick={() => setConfirm(false)}>Keep going</button></div>
            </div>
          </div>
        )}
      </div>
    </Portal>
  );

  if (summary) return shell(
    <div style={{ display: "grid", gap: 12, width: "min(560px, 100%)" }}>
      <b style={{ fontSize: 22 }}>{summary.reason === "finished" ? "Session done" : "Session ended"}</b>
      <div>{summary.answered} answered · <b>{summary.accuracy}%</b> right · {summary.minutes} min{summary.left ? ` · ${summary.left} left in the queue` : ""}</div>
      {summary.lapsed.length > 0 && <div><span className="label">Missed (they&apos;ll come back soon)</span><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{summary.lapsed.slice(0, 12).map((x: A) => <li key={x.id} style={{ fontSize: 13 }}>{label(x)}</li>)}</ul></div>}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        {summary.left > 0 && <button className="pill" data-active="true" onClick={() => { setSummary(null); void api({ action: "session_resume", id: sid }); }}>Continue where I left off</button>}
        <button className="pill" onClick={() => { setSummary(null); setLog([]); setI(0); setQueue(null); void load(); }}>{summary.left ? "Start a new session" : "Do 10 more"}</button>
        <button className="pill" onClick={onClose}>Back to page</button>
      </div>
    </div>,
  );
  if (!queue) return shell(<div className="label">Loading your queue…</div>);
  if (!cur) return shell(<div className="label">Nothing due right now. 🎉</div>);
  const p = cur.payload ?? {};
  return shell(
    <div style={{ display: "grid", gap: 14, width: "min(720px, 100%)" }}>
      <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
        <span className="pill" style={{ height: 22, fontSize: 11 }}>{KIND_LABEL[cur.kind] ?? cur.kind}{cur.deck ? ` · ${cur.deck}` : ""}</span>
        <span className="pill" style={{ height: 22, fontSize: 11 }}>{cur.state}</span>
        {cur.exam && <span className="pill" style={{ height: 22, fontSize: 11, background: "var(--danger)", color: "#fff" }}>test {new Date(cur.exam.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{cur.exam.cram ? " · cram" : ""}</span>}
        {cur.leech && <span className="pill" style={{ height: 22, fontSize: 11, color: "#f5a524" }}>leech: rewrite it?</span>}
        <span style={{ flex: 1 }} />
        {["flashcard", "mistake", "question", "spec"].includes(cur.kind) && <button className="pill" style={{ height: 24, fontSize: 11 }} onClick={() => setEditing({ front: p.front ?? "", back: p.back ?? "" })}>✎ Edit</button>}
        <button className="pill" style={{ height: 24, fontSize: 11 }} onClick={async () => { await api({ action: "suspend", item_id: cur.id }); next(); }}>Suspend</button>
        <button className="pill" style={{ height: 24, fontSize: 11 }} onClick={() => submit(`Explain this so it sticks (it's from my ${KIND_LABEL[cur.kind] ?? cur.kind} reviews${cur.spec_code ? `, spec ${cur.spec_code}` : ""}): ${label(cur)}${p.back ? `\nAnswer: ${p.back}` : ""}`, { mode: "tutor" })}>Ask Apollo</button>
      </div>
      {editing ? (
        <div style={{ display: "grid", gap: 6 }}>
          <textarea value={editing.front} onChange={(e) => setEditing({ ...editing, front: e.target.value })} rows={4} style={{ padding: 8, borderRadius: 8, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} />
          <textarea value={editing.back} onChange={(e) => setEditing({ ...editing, back: e.target.value })} rows={4} style={{ padding: 8, borderRadius: 8, background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} />
          <div className={u.row}><button className="pill" data-active="true" onClick={async () => { await api({ action: "edit", item_id: cur.id, payload: editing }); setQueue((q) => (q ?? []).map((x: A) => (x.id === cur.id ? { ...x, payload: { ...x.payload, ...editing } } : x))); setEditing(null); }}>Save</button><button className="pill" onClick={() => setEditing(null)}>Cancel</button></div>
        </div>
      ) : auto ? <GeoItem p={p} typed={typed} setTyped={setTyped} result={result} onCheck={(v) => { const correct = p.mode === "capital" ? p.capital : p.name; setTyped(v); setResult({ ok: norm(v) === norm(correct ?? ""), correct }); }}
        onNext={() => void grade(result?.ok ? 3 : 1, { correct: result?.ok, answer: typed, confused_with: result?.ok ? null : typed })} />
        : (
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ padding: 18, borderRadius: 12, background: "var(--surface)", fontSize: 17, minHeight: 110 }}><RichText text={cur.kind === "opening" ? `Play the main line of **${p.name}** (as ${p.side}) from memory, then flip.` : p.front} /></div>
            {flipped ? (
              <>
                <div style={{ padding: 18, borderRadius: 12, background: "var(--surface-2)", fontSize: 16 }}><RichText text={cur.kind === "opening" ? `Check it on Mind › Openings (Explore lines).` : p.back} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {RATINGS.map(([g, l, c]) => <button key={g} className="pill" disabled={busy} onClick={() => void grade(g)} style={{ height: 50, borderColor: c, display: "grid", placeItems: "center" }}><b>{l}</b><small className="label">{g}</small></button>)}
                </div>
              </>
            ) : <button className="pill" data-active="true" onClick={() => setFlipped(true)} style={{ height: 50, display: "grid", placeItems: "center" }}>Show answer (Space)</button>}
          </div>
        )}
      <small className="label" style={{ textAlign: "center" }}>Space flip · 1-4 rate · Z undo · Esc end</small>
    </div>,
  );
}

const label = (x: A) => { const p = x.payload ?? {}; return x.kind === "geo" ? `${p.mode === "flag" ? "Flag of" : p.mode === "capital" ? "Capital of" : "Country with capital"} ${p.mode === "country-of-capital" ? p.capital : p.name}` : String(p.front ?? p.name ?? "").slice(0, 140); };

const COUNTRY_NAMES: string[] = [];
function GeoItem({ p, typed, setTyped, result, onCheck, onNext }: { p: A; typed: string; setTyped: (s: string) => void; result: { ok: boolean; correct: string } | null; onCheck: (v: string) => void; onNext: () => void }) {
  const [opts, setOpts] = useState<string[]>(COUNTRY_NAMES);
  useEffect(() => { void import("@/data/countries.json").then((m) => { const all = (m.default as { n: string; c: string }[]); setOpts([...new Set(p.mode === "capital" ? all.map((c) => c.c).filter(Boolean) : all.map((c) => c.n))].sort()); }); }, [p.mode]);
  const matches = typed.length ? opts.filter((o) => o.toLowerCase().startsWith(typed.toLowerCase())).slice(0, 6) : [];
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      {p.mode === "flag"
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={`https://flagcdn.com/w320/${p.code}.png`} alt="Flag to identify" style={{ maxWidth: "min(320px, 80vw)", borderRadius: 6, boxShadow: "0 6px 20px rgba(0,0,0,.35)" }} />
        : <p style={{ fontSize: 20, textAlign: "center" }}>{p.mode === "capital" ? <>What is the capital of <b>{p.name}</b>?</> : <><b>{p.capital}</b> is the capital of…</>}</p>}
      {!result ? (
        <div style={{ width: "min(420px, 100%)", display: "grid", gap: 4 }}>
          <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && typed.trim()) { e.preventDefault(); onCheck(matches[0] && !opts.some((o) => o.toLowerCase() === typed.toLowerCase()) ? matches[0] : typed); } }}
            placeholder={p.mode === "capital" ? "Type the capital…" : "Type the country…"} style={{ height: 40, padding: "0 12px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 16 }} />
          {matches.map((m) => <button key={m} className="pill" onClick={() => onCheck(m)} style={{ justifyContent: "flex-start" }}>{m}</button>)}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, justifyItems: "center" }}>
          <div style={{ fontSize: 18 }}>{result.ok ? <b style={{ color: "var(--good)" }}>✓ {result.correct}</b> : <><b style={{ color: "var(--danger)" }}>✗ {typed}</b> · it&apos;s <b>{result.correct}</b></>} <small className="label">({p.subregion})</small></div>
          <button className="pill" data-active="true" autoFocus onClick={onNext} style={{ height: 44, minWidth: 160, display: "grid", placeItems: "center" }}>Next (Enter)</button>
        </div>
      )}
    </div>
  );
}
