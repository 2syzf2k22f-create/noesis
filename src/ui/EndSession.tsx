"use client";
// The same "End session" control for every session that isn't a review queue (puzzles, opening drills,
// poker, brain tests, memory, timed questions): always visible while a session runs, Esc or Ctrl+E,
// a confirm when something has been answered, a summary, and the session is recorded in sr_sessions.
// Apollo's "end this session" (noesis:end-session) ends it too.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import u from "./ui.module.css";

const api = (body: object) => fetch("/api/sr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
const nowMs = () => Date.now();

export type EndStats = { answered: number; correct?: number; lines?: string[] };

export function EndSession({ active, kind, area = "mind", stats, onEnd, onAgain, unit = "answered" }: {
  active: boolean; kind: string; area?: string; stats: EndStats; onEnd: () => void; onAgain?: () => void; unit?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [summary, setSummary] = useState<(EndStats & { minutes: number }) | null>(null);
  const sid = useRef<string | null>(null);
  const started = useRef(0);
  const live = useRef(stats); live.current = stats; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    if (active && !sid.current) { started.current = nowMs(); void api({ action: "session_start", area, kind, mode: "free" }).then((r) => { sid.current = r.id ?? null; }); }
  }, [active, area, kind]);
  const finish = () => {
    setConfirm(false);
    const st = live.current;
    if (sid.current) void api({ action: "session_end", id: sid.current, end_reason: "ended_early", answered: st.answered, correct: st.correct ?? null });
    sid.current = null;
    if (st.answered) setSummary({ ...st, minutes: Math.max(1, Math.round((nowMs() - started.current) / 60000)) });
    onEnd();
  };
  const end = () => { if (!live.current.answered) finish(); else setConfirm(true); };
  const endRef = useRef(end); endRef.current = end; // eslint-disable-line react-hooks/refs
  useEffect(() => {
    if (!active) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.ctrlKey && e.key.toLowerCase() === "e")) { e.preventDefault(); if (confirm) setConfirm(false); else endRef.current(); }
    };
    const ev = () => endRef.current();
    window.addEventListener("keydown", k); window.addEventListener("noesis:end-session", ev);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("noesis:end-session", ev); };
  }, [active, confirm]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <>
      {active && !summary && (
        <button className="pill" onClick={end} title="End session (Esc or Ctrl+E)" data-testid="end-session"
          style={{ position: "fixed", right: 18, bottom: 18, zIndex: 310, height: 40, padding: "0 16px", background: "var(--danger)", borderColor: "var(--danger)", color: "#fff", boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>
          ■ End session{stats.answered ? ` · ${stats.answered} ${unit}` : ""}
        </button>
      )}
      {(confirm || summary) && (
        <div onClick={() => { setConfirm(false); setSummary(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", zIndex: 330 }}>
          <div onClick={(e) => e.stopPropagation()} className="panel" style={{ padding: 18, display: "grid", gap: 10, background: "var(--bg)", maxWidth: 400 }}>
            {confirm ? <>
              <b>End now? {stats.answered} {unit} so far.</b>
              <small className="label">Everything you&apos;ve done is saved.</small>
              <div className={u.row}><button className="pill" data-active="true" autoFocus onClick={finish}>End session</button><button className="pill" onClick={() => setConfirm(false)}>Keep going</button></div>
            </> : summary && <>
              <b style={{ fontSize: 18 }}>Session ended</b>
              <div>{summary.answered} {unit}{summary.correct != null ? <> · <b>{Math.round((summary.correct / Math.max(1, summary.answered)) * 100)}%</b> right</> : null} · {summary.minutes} min</div>
              {summary.lines?.map((l) => <small key={l} className="label">{l}</small>)}
              <div className={u.row}>
                {onAgain && <button className="pill" data-active="true" onClick={() => { setSummary(null); onAgain(); }}>Start again</button>}
                <button className="pill" onClick={() => setSummary(null)}>Back to page</button>
              </div>
            </>}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
