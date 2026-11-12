"use client";

import { useEffect, useState } from "react";
import { useApollo } from "./apollo";
import s from "./shell.module.css";

type Act = { id: string; tool: string; table: string | null; at: string; undone: boolean; label: string };

const ago = (iso?: string | null) => {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};
const fmt = (n?: number | null) => (n == null ? "no data" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const until = (sec: number) => new Date(sec * 1000).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });

/** Relay status, plan usage, and the action log with Undo/rollback. */
export function ApolloPanel() {
  const { status, refreshStatus, changes, undoApollo } = useApollo();
  const [acts, setActs] = useState<Act[] | null>(null);

  useEffect(() => {
    refreshStatus();
    fetch("/api/actions").then((r) => (r.ok ? r.json() : [])).then(setActs).catch(() => setActs([]));
  }, [changes, refreshStatus]);

  if (status && !status.configured)
    return <div className={s.empty}><div className="display">offline</div><p>The database isn&apos;t connected yet, so the relay, chats and undo are off.</p></div>;

  const plan = status?.plan;
  return (
    <div className={s.apollo}>
      <section>
        <div className={s.kv}>
          <span className="label">Relay</span>
          <span data-good={status?.relay?.online}>{status?.relay?.online ? (status.relay.busy ? "online · working" : "online") : "offline"}</span>
        </div>
        <div className={s.kv}><span className="label">Last seen</span><span>{ago(status?.relay?.lastHeartbeat)}</span></div>
        <div className={s.kv}><span className="label">Queue</span><span>{status?.queued ?? 0}{status?.backAt ? ` · back at ${new Date(status.backAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : ""}</span></div>
      </section>

      <section>
        <div className="label">Pro plan usage</div>
        {plan ? (
          (["five_hour", "seven_day"] as const).filter((k) => plan[k]).map((k) => (
            <div key={k} className={s.meter}>
              <div className={s.kv}>
                <span>{k === "five_hour" ? "Session (5 h)" : "Weekly"}</span>
                <span>{Math.round(plan[k].utilization * 100)}% · resets {until(plan[k].resetsAt)}</span>
              </div>
              <i style={{ ["--v" as string]: `${Math.min(100, plan[k].utilization * 100)}%` }} />
            </div>
          ))
        ) : (
          <p className={s.note}>No reading yet. The relay reads it from Claude Code after each job.</p>
        )}
        {status?.planAt && <p className={s.note}>As of {ago(status.planAt)}. <a href="https://claude.ai/settings/usage" target="_blank" rel="noreferrer">claude.ai meter</a></p>}
        <div className={s.kv}><span className="label">Tokens today</span><span>{fmt(status?.tokens?.today)}</span></div>
        <div className={s.kv}><span className="label">This week</span><span>{fmt(status?.tokens?.week)}</span></div>
        <div className={s.kv}><span className="label">Last message</span><span>{fmt(status?.tokens?.last)}</span></div>
      </section>

      <section>
        <div className={s.kv}>
          <span className="label">Changes</span>
          <button className={s.linkBtn} onClick={() => undoApollo()}>Undo last</button>
        </div>
        {acts === null ? <p className={s.note}>Loading…</p> : acts.length === 0 ? <p className={s.note}>No changes yet.</p> : (
          <ol className={s.actions}>
            {acts.map((a) => (
              <li key={a.id} data-undone={a.undone}>
                <span>{a.tool.replace(/_/g, " ")}{a.label ? ` · ${String(a.label).slice(0, 28)}` : ""}<small>{ago(a.at)}</small></span>
                {!a.undone && <button className={s.linkBtn} onClick={() => undoApollo(a.id)} title="Undo this and everything after it">Roll back</button>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
