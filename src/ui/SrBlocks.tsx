"use client";
// Spaced repetition on the page: the Review queue (due per area, Start all due, per area/deck), a
// "Due today" dashboard card, a "Due now: N / Review due" badge for any page, and SR settings.

import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { SrSession, type SrFilter } from "./SrSession";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const AREAS: [string, string][] = [["school", "School"], ["mind", "Mind"], ["languages", "Languages"]];
const KIND_NAME: Record<string, string> = { flashcard: "Flashcards", mistake: "Mistakes", question: "Questions", spec: "Spec points", geo: "Geography", puzzle: "Chess puzzles", opening: "Openings", vocab: "Vocabulary", palace: "Memory palaces", poker: "Poker", coding: "Coding" };

let cache: Promise<A> | null = null, at = 0;
export function useSrStatus() {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!cache || Date.now() - at > 5000) { at = Date.now(); cache = fetch("/api/sr?view=status").then((r) => (r.ok ? r.json() : null)).catch(() => null); }
    let live = true; void cache.then((j) => { if (live) setD(j); });
    return () => { live = false; };
  }, [changes, tick]);
  useEffect(() => { const f = () => { at = 0; setTick((t) => t + 1); }; window.addEventListener("noesis:sr-reviewed", f); return () => window.removeEventListener("noesis:sr-reviewed", f); }, []);
  return d;
}
/** Open a session from anywhere (also used by Apollo's start_sr_session via ?review=area:kind). */
export function useSession() {
  const [f, setF] = useState<SrFilter | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("review");
    if (q) { const [area, kind, deck, weak] = q.split(":"); queueMicrotask(() => setF({ area: area || "all", kind: kind || undefined, deck: deck || undefined, weak: weak === "weak" || undefined, title: weak === "weak" ? "Weakest items" : "Review" })); }
    const h = (e: Event) => setF((e as CustomEvent).detail as SrFilter);
    window.addEventListener("noesis:start-session", h);
    return () => window.removeEventListener("noesis:start-session", h);
  }, []);
  const el = f ? <SrSession filter={f} onClose={() => { setF(null); window.dispatchEvent(new Event("noesis:sr-reviewed")); }} /> : null;
  return [el, setF] as const;
}
const dueIn = (c: A) => (c ? c.due + c.new : 0);

export function SrQueue() {
  const d = useSrStatus();
  const [el, start] = useSession();
  if (!d) return <div className="label">Loading…</div>;
  const total = AREAS.reduce((a, [k]) => a + dueIn(d.counts[k]), 0);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {el}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 12 }}>
        <button className="pill" data-active="true" style={{ height: 48, fontSize: 16, padding: "0 22px" }} disabled={!total} onClick={() => start({ area: "all", title: "All due (mixed)", limit: 50 })}>▶ Start all due ({total})</button>
        <span><b style={{ fontSize: 20 }}>{d.reviews_today}</b> <small className="label">reviews today</small></span>
        <span><b style={{ fontSize: 20 }}>{d.streak}</b> <small className="label">day streak</small></span>
        <span><b style={{ fontSize: 20 }}>{d.retention_30d ?? "–"}{d.retention_30d != null ? "%" : ""}</b> <small className="label">retention, 30 days (target {Math.round(d.settings.retention * 100)}%)</small></span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 10 }}>
        {AREAS.map(([k, name]) => {
          const c = d.counts[k] ?? { due: 0, new: 0, learning: 0, kinds: {}, decks: {} };
          const kinds = Object.entries(c.kinds as Record<string, number>).filter(([kk]) => !kk.endsWith("(new)"));
          const news = Object.entries(c.kinds as Record<string, number>).filter(([kk]) => kk.endsWith("(new)"));
          return (
            <section key={k} style={{ padding: 12, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", gap: 8, alignContent: "start" }}>
              <div className={u.row}><b style={{ flex: 1 }}>{name}</b><small className="label">{c.due} due · {c.learning} learning · {c.new} new today</small></div>
              <button className="pill" data-active={dueIn(c) > 0} disabled={!dueIn(c)} onClick={() => start({ area: k, title: `${name}: all due` })}>Review {name} ({dueIn(c)})</button>
              {kinds.map(([kind, n]) => <button key={kind} className="pill" onClick={() => start({ area: k, kind, title: KIND_NAME[kind] ?? kind })} style={{ justifyContent: "space-between", display: "flex" }}><span>{KIND_NAME[kind] ?? kind}</span><b>{n}</b></button>)}
              {news.length > 0 && <small className="label">New available: {news.map(([kk, n]) => `${KIND_NAME[kk.replace(" (new)", "")] ?? kk} ${n}`).join(" · ")}</small>}
              {k === "languages" && dueIn(c) === 0 && <small className="label">Vocabulary isn&apos;t on the shared engine yet.</small>}
            </section>
          );
        })}
      </div>
      <section style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 6 }}>
        <span className="label">Next 7 days</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, alignItems: "end", height: 90 }}>
          {d.forecast.map((f: A) => { const max = Math.max(1, ...d.forecast.map((x: A) => x.due)); return <div key={f.day} data-tip={`${f.day}: ${f.due} due`} style={{ display: "grid", gap: 2, alignItems: "end", height: "100%" }}><div style={{ height: `${(f.due / max) * 70}px`, background: "var(--chart-1)", borderRadius: 3 }} /><small className="label" style={{ textAlign: "center" }}>{new Date(`${f.day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short" })} {f.due}</small></div>; })}
        </div>
      </section>
      {d.leeches.length > 0 && (
        <section style={{ padding: 12, borderRadius: 12, background: "var(--surface)", display: "grid", gap: 4 }}>
          <span className="label">Leeches ({d.leeches.length}): items you keep forgetting. Rewrite them, add a mnemonic, or split them.</span>
          {d.leeches.map((l: A) => <div key={l.id} style={{ fontSize: 13 }}>{KIND_NAME[l.kind] ?? l.kind}{l.deck ? ` · ${l.deck}` : ""}: {l.front} <small className="label">({l.lapses} lapses)</small></div>)}
        </section>
      )}
      <small className="label">{d.totals.items} items · {d.totals.known} known · {d.totals.mastered} mastered (interval 3+ weeks).</small>
    </div>
  );
}

export function SrDue() {
  const d = useSrStatus();
  const [el, start] = useSession();
  if (!d) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {el}
      <div className={u.row} style={{ gap: 10, flexWrap: "wrap" }}>
        {AREAS.map(([k, n]) => <span key={k}><b style={{ fontSize: 22 }}>{dueIn(d.counts[k])}</b> <small className="label">{n}</small></span>)}
        <span><b style={{ fontSize: 22 }}>{d.streak}</b> <small className="label">day streak</small></span>
      </div>
      <div style={{ display: "flex", gap: 3, alignItems: "end", height: 30 }}>{d.forecast.map((f: A) => { const max = Math.max(1, ...d.forecast.map((x: A) => x.due)); return <i key={f.day} data-tip={`${f.day}: ${f.due} due`} style={{ flex: 1, height: `${Math.max(2, (f.due / max) * 30)}px`, background: "var(--chart-1)", borderRadius: 2 }} />; })}</div>
      <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={() => start({ area: "all", title: "All due (mixed)", limit: 50 })}>▶ Review due</button>
    </div>
  );
}

/** "Due now: N" + "Review due" for one page's items. p: { area?, kind?, deck?, title? } */
export function SrBadge({ p }: { p: A }) {
  const d = useSrStatus();
  const [el, start] = useSession();
  if (!d) return null;
  const c = d.counts[p.area ?? "school"];
  const n = p.kind ? (c?.kinds?.[p.kind] ?? 0) + (c?.kinds?.[`${p.kind} (new)`] ? Math.min(c.new, c.kinds[`${p.kind} (new)`]) : 0) : dueIn(c);
  return (
    <div className={u.row} style={{ gap: 8, flexWrap: "wrap" }}>
      {el}
      <span className="pill" data-active={n > 0}>Due now: {n}</span>
      <button className="pill" data-active={n > 0} onClick={() => start({ area: p.area, kind: p.kind, deck: p.deck, title: p.title ?? KIND_NAME[p.kind] ?? "Review" })}>Review due</button>
      <small className="label">Spaced repetition: missed items come back sooner, known ones further out.</small>
    </div>
  );
}

export function SrSettingsBlock() {
  const d = useSrStatus();
  const [s, setS] = useState<A>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (d?.settings && !s) queueMicrotask(() => setS(d.settings)); }, [d, s]);
  if (!s) return <div className="label">Loading…</div>;
  const f: React.CSSProperties = { height: 30, width: 80, padding: "0 6px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" };
  const num = (k: string, label: string, step = 1) => <label className="label" style={{ display: "grid", gap: 2 }}>{label}<input type="number" step={step} value={s[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} style={f} /></label>;
  const flag = (k: string, label: string) => <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />{label}</label>;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
        <label className="label" style={{ display: "grid", gap: 2 }}>Target retention {Math.round(s.retention * 100)}%<input type="range" min={0.8} max={0.95} step={0.01} value={s.retention} onChange={(e) => setS({ ...s, retention: Number(e.target.value) })} /></label>
        {num("new_per_day", "New items per day")}
        {num("max_reviews_per_day", "Max reviews per day")}
        {num("leech_lapses", "Leech after N lapses")}
        {num("rollover_hour", "Day rolls over at (hour)")}
        {[["default", "Session length"], ...AREAS.map(([k, n]) => [k, `${n} session`])].map(([k, label]) => (
          <label key={k} className="label" style={{ display: "grid", gap: 2 }}>{label}
            <select value={String(s.session_length?.[k] ?? (k === "default" ? 20 : ""))} onChange={(e) => { const sl = { ...s.session_length }; if (e.target.value === "") delete sl[k]; else sl[k] = Number(e.target.value); setS({ ...s, session_length: sl }); }} style={{ ...f, width: 120 }}>
              {k !== "default" && <option value="">as default</option>}
              {[10, 20, 30, 50, 100].map((n) => <option key={n} value={n}>{n} items</option>)}
              <option value="0">Unlimited</option>
            </select>
          </label>
        ))}
        <label className="label" style={{ display: "grid", gap: 2 }}>Learning steps (min)<input value={(s.learning_steps ?? []).join(", ")} onChange={(e) => setS({ ...s, learning_steps: e.target.value.split(/[,\s]+/).map(Number).filter((x) => x > 0) })} style={{ ...f, width: 110 }} /></label>
        <label className="label" style={{ display: "grid", gap: 2 }}>Morning nudge<input type="time" value={s.nudge_time ?? "07:30"} onChange={(e) => setS({ ...s, nudge_time: e.target.value })} style={{ ...f, width: 110 }} /></label>
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 12 }}>
        {flag("confirm_end", "Confirm before ending a session")}
        {flag("esc_ends", "Esc ends a session")}
        {flag("count_free_practice", "Count free practice towards schedules")}
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 12 }}>
        {AREAS.map(([k, n]) => <label key={k} className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!s.areas_off?.includes(k)} onChange={(e) => setS({ ...s, areas_off: e.target.checked ? (s.areas_off ?? []).filter((x: string) => x !== k) : [...(s.areas_off ?? []), k] })} />SR for {n}</label>)}
      </div>
      <button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={async () => { await fetch("/api/sr", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "settings", settings: s }) }); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? "Saved" : "Save"}</button>
    </div>
  );
}

const LEVEL = [["New", "var(--surface-2)"], ["Learning", "#f5a524"], ["Known", "#30a46c"], ["Mastered", "#5b8def"]] as const;
/** Geography: every country coloured by how well it's known (weakest mode decides), and the weakest list. */
export function SrGeo() {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  const [tick, setTick] = useState(0);
  const [el, start] = useSession();
  const [mode, setMode] = useState<"all" | "flag" | "capital" | "country-of-capital">("all");
  useEffect(() => { fetch("/api/sr?view=geo").then((r) => r.json()).then(setD).catch(() => {}); }, [changes, tick]);
  useEffect(() => { const f = () => setTick((t) => t + 1); window.addEventListener("noesis:sr-reviewed", f); return () => window.removeEventListener("noesis:sr-reviewed", f); }, []);
  if (!d) return <div className="label">Loading…</div>;
  const lv = (c: A) => (mode === "all" ? c.level : c.modes[mode] ?? 0);
  const regions = [...new Set<string>(d.countries.map((c: A) => c.region))].sort();
  const counts = LEVEL.map((_, k) => d.countries.filter((c: A) => lv(c) === k).length);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {el}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        {(["all", "flag", "capital", "country-of-capital"] as const).map((m) => <button key={m} className="pill" data-active={mode === m} onClick={() => setMode(m)}>{m === "all" ? "All modes" : m === "flag" ? "Flags" : m === "capital" ? "Capitals" : "Capital → country"}</button>)}
        <span style={{ flex: 1 }} />
        {LEVEL.map(([n, c], k) => <span key={n} className="label" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}><i style={{ width: 10, height: 10, borderRadius: 3, background: c, display: "inline-block" }} />{n} {counts[k]}</span>)}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {regions.map((r) => (
          <div key={r}>
            <span className="label">{r} · {d.countries.filter((c: A) => c.region === r && lv(c) >= 2).length}/{d.countries.filter((c: A) => c.region === r).length} known</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
              {d.countries.filter((c: A) => c.region === r).map((c: A) => <span key={c.code} title={`${c.name}: ${LEVEL[lv(c)][0]}${c.lapses ? ` · ${c.lapses} lapses` : ""}`} style={{ width: 16, height: 16, borderRadius: 3, background: LEVEL[lv(c)][1], outline: c.weak ? "1.5px solid var(--danger)" : undefined }} />)}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <div className={u.row}><b>Weakest countries</b><span style={{ flex: 1 }} />{d.weakest.length > 0 && <button className="pill" data-active="true" onClick={() => start({ area: "mind", kind: "geo", weak: true, limit: 25, title: "Weakest countries" })}>▶ Review these ({d.weakest.length})</button>}</div>
        {d.weakest.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{d.weakest.map((c: A) => <span key={c.code} className="pill" style={{ height: 26, fontSize: 12 }}>{c.name}<small className="label" style={{ marginLeft: 6 }}>{c.lapses} lapse{c.lapses === 1 ? "" : "s"}</small></span>)}</div>
        ) : <small className="label">No weak countries yet: anything you miss shows up here.</small>}
      </div>
    </div>
  );
}

/** Interval distribution + the real retention curve (share remembered vs days since the last review). */
export function SrCharts({ p }: { p: A }) {
  const { changes } = useApollo();
  const [d, setD] = useState<A>(null);
  useEffect(() => { fetch(`/api/sr?view=charts${p?.kind ? `&kind=${p.kind}` : ""}`).then((r) => r.json()).then(setD).catch(() => {}); }, [changes, p?.kind]);
  if (!d) return <div className="label">Loading…</div>;
  const maxN = Math.max(1, ...d.intervals.map((x: A) => x.n));
  const bar = (h: number, color: string, label: string, top: string) => (
    <div style={{ display: "grid", gridTemplateRows: "auto 120px auto", justifyItems: "center", gap: 4, flex: 1, minWidth: 0 }}>
      <small style={{ fontSize: 11 }}>{top}</small>
      <div style={{ alignSelf: "end", width: "70%", height: `${Math.max(2, h)}%`, background: color, borderRadius: "4px 4px 0 0" }} />
      <small className="label" style={{ fontSize: 10 }}>{label}</small>
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 18 }}>
      <div>
        <span className="label">Intervals now ({d.items_in_review} items in review)</span>
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>{d.intervals.map((x: A) => bar((x.n / maxN) * 100, "var(--accent)", x.label, String(x.n)))}</div>
      </div>
      <div>
        <span className="label">Retention by gap since last review ({d.reviews_counted} reviews) · target {d.target}%</span>
        <div style={{ position: "relative", display: "flex", gap: 4, marginTop: 6 }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: `calc(18px + 120px * ${(100 - d.target) / 100})`, borderTop: "1px dashed var(--text-dim)" }} />
          {d.retention.map((x: A) => bar(x.pct ?? 0, x.pct == null ? "transparent" : x.pct >= d.target ? "#30a46c" : "#f5a524", x.label, x.pct == null ? "–" : `${x.pct}% (${x.n})`))}
        </div>
      </div>
    </div>
  );
}
