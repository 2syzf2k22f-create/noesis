"use client";
// Always-on helpers beside the corner menus: current/next lesson, a focus timer that logs
// study time, browser reminders (homework due, next lesson), and a "?" shortcuts overlay.

import Link from "next/link";
import { useEffect, useState } from "react";
import s from "./dock.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const SUBJECTS = ["Maths", "Further Maths", "Physics", "Economics", "Other"];
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} } };
const nowMs = () => Date.now();
const hmNow = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const todayNum = () => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" })).getDay(); return d === 0 ? 7 : d; };
async function data(binds: object[]) {
  return fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds }) }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
}
function notify(title: string, body: string, key: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const seen = JSON.parse(ls.get("noesis.notified") ?? "{}") as Record<string, number>;
  if (seen[key]) return;
  seen[key] = nowMs();
  for (const [k, t] of Object.entries(seen)) if (nowMs() - t > 7 * 864e5) delete seen[k];
  ls.set("noesis.notified", JSON.stringify(seen));
  try { new Notification(title, { body, icon: "/favicon.ico" }); } catch {}
}

export function ShellExtras() {
  const [lessons, setLessons] = useState<Row[]>([]);
  const [hm, setHm] = useState("");
  const [focus, setFocus] = useState<{ end: number; minutes: number; subject: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const [perm, setPerm] = useState<string>("default");

  // timetable + reminders, refreshed every 5 minutes
  useEffect(() => {
    const load = async () => {
      setHm(hmNow());
      const [tt, hw] = await data([{ table: "timetable", limit: 300 }, { table: "homework", where: { status: "to do" }, limit: 100 }]);
      const today = ((tt?.rows ?? []) as Row[]).filter((l) => Number(l.day) === todayNum()).sort((a, b) => String(a.start).localeCompare(String(b.start)));
      setLessons(today);
      // reminders
      for (const h of (hw?.rows ?? []) as Row[]) {
        if (!h.due_at) continue;
        const hrs = (Date.parse(h.due_at) - nowMs()) / 3600e3;
        if (hrs > 0 && hrs < 24) notify("Homework due soon", `${h.title}${h.subject ? ` (${h.subject})` : ""}: due ${new Date(h.due_at).toLocaleString("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" })}`, `hw:${h.id}:${new Date().toDateString()}`);
      }
      const t = hmNow();
      const next = today.find((l) => l.start > t);
      if (next) {
        const [H, M] = String(next.start).split(":").map(Number), [h2, m2] = t.split(":").map(Number);
        const mins = H * 60 + M - (h2 * 60 + m2);
        if (mins > 0 && mins <= 10) notify(`${next.subject} at ${next.start}`, next.room ? `Room ${next.room}` : "Next lesson", `ls:${next.id}:${new Date().toDateString()}`);
      }
    };
    void load();
    const id = setInterval(load, 5 * 60_000);
    const tick = setInterval(() => setHm(hmNow()), 30_000);
    queueMicrotask(() => setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission));
    return () => { clearInterval(id); clearInterval(tick); };
  }, []);

  // focus timer (survives reloads)
  useEffect(() => {
    const saved = ls.get("noesis.focus");
    if (saved) queueMicrotask(() => setFocus(JSON.parse(saved)));
  }, []);
  useEffect(() => {
    if (!focus) return;
    const step = () => {
      const l = Math.max(0, Math.round((focus.end - nowMs()) / 1000));
      setLeft(l);
      if (l === 0) {
        void fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "create", table: "study_sessions", data: { subject: focus.subject, minutes: focus.minutes, label: "focus timer" } }) });
        notify("Focus session done", `${focus.minutes} min of ${focus.subject} logged. Take a break.`, `focus:${focus.end}`);
        ls.set("noesis.focus", null);
        setFocus(null);
      }
    };
    step();
    const id = setInterval(step, 1000);
    return () => clearInterval(id);
  }, [focus]);

  // "?" opens the shortcuts overlay
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable]")) return;
      if (e.key === "?") { e.preventDefault(); setHelp((h) => !h); }
      if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const start = (minutes: number, subject: string) => {
    const f = { end: nowMs() + minutes * 60_000, minutes, subject };
    ls.set("noesis.focus", JSON.stringify(f));
    setFocus(f); setMenu(false);
  };
  const cur = lessons.find((l) => l.start <= hm && l.end > hm);
  const next = lessons.find((l) => l.start > hm);
  const lessonText = cur ? `Now: ${cur.subject}${cur.room ? ` · ${cur.room}` : ""} till ${cur.end}` : next ? `Next: ${next.subject} ${next.start}${next.room ? ` · ${next.room}` : ""}` : null;

  return (
    <>
      <div className={s.extras}>
        {lessonText && <Link className={s.chip} href="/s/school/timetable" title="Today's timetable">{lessonText}</Link>}
        <button className={s.chip} data-on={!!focus} onClick={() => setMenu(!menu)} title="Focus timer">
          {focus ? `◷ ${focus.subject} ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : "◷ Focus"}
        </button>
        {menu && (
          <div className={s.extrasMenu}>
            {focus ? (
              <>
                <b>{focus.subject} · {focus.minutes} min</b>
                <button className="pill" onClick={() => { ls.set("noesis.focus", null); setFocus(null); setMenu(false); }}>Stop (don&apos;t log)</button>
              </>
            ) : (
              <>
                <span className="label">Focus on…</span>
                {SUBJECTS.map((sub) => (
                  <div key={sub} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ flex: 1, fontSize: 13 }}>{sub}</span>
                    {[25, 50].map((m) => <button key={m} className="pill" onClick={() => start(m, sub)}>{m}m</button>)}
                  </div>
                ))}
              </>
            )}
            {perm !== "granted" && perm !== "unsupported" && <button className="pill" onClick={async () => { setPerm(await Notification.requestPermission()); }}>Turn on reminders</button>}
            {perm === "granted" && <small className="label">Reminders on: homework due within 24 h, lessons 10 min before.</small>}
          </div>
        )}
      </div>
      {help && (
        <div className={s.helpScrim} onClick={() => setHelp(false)}>
          <div className={s.help} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts">
            <b>Keyboard shortcuts</b>
            {[["Ctrl / ⌘ + K", "Command palette: search your data, go anywhere, ask Apollo"], ["/", "Type to Apollo (chatbox)"], ["Hold Alt + P", "Talk to Apollo (push to talk)"], ["Esc", "Close panels and menus"], ["← →", "Step through chess moves (boards and reviews)"], ["?", "This list"], ["build: …", "In the chatbox: ask for a change to the site's code"]].map(([k, v]) => (
              <div key={k} className={s.helpRow}><kbd>{k}</kbd><span>{v}</span></div>
            ))}
            <a className="pill" href="/api/export" download>Export all my data (JSON)</a>
          </div>
        </div>
      )}
    </>
  );
}
