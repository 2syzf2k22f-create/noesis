"use client";
// University explorer: courses and universities (researched by Apollo with sources, or added by you),
// filters and sorting, full detail with every stat, offer vs your predicted grades, compare, map, shortlist.

import { useEffect, useMemo, useState } from "react";
import { useApollo } from "@/shell/apollo";
import type { BlockCtx } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const field: React.CSSProperties = { height: 34, padding: "0 8px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)" };
const STATUS = ["researching", "interested", "open day booked", "applying", "firm", "insurance", "declined"];
const ORDER = ["A*", "A", "B", "C", "D", "E", "U"];
async function data(binds: object[]) {
  return fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds }) }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
}
const save = (op: "update" | "create", table: string, d: object, id?: string) => fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, table, data: d, id }) });

/** "A*AA" -> ["A*","A","A"] */
const parseOffer = (o?: string | null) => (o ? (o.toUpperCase().replace(/\s/g, "").match(/A\*|[A-E]/g) ?? []) : []);
/** Does a set of predicted grades meet an offer? Returns null if unknown. */
function meets(offer: string[], predicted: string[]) {
  if (!offer.length || predicted.length < offer.length) return null;
  const mine = [...predicted].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const need = [...offer].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  let short = 0;
  need.forEach((g, i) => { short += Math.max(0, ORDER.indexOf(mine[i]) - ORDER.indexOf(g)); });
  return short;
}

const LABEL: Record<string, string> = {
  typical_offer: "Typical offer", contextual_offer: "Contextual offer", required_subjects: "Required subjects", admissions_test: "Admissions test", interview: "Interview",
  applicants_per_place: "Applicants per place", offer_rate_pct: "Offer rate %", intake: "Intake", satisfaction_pct: "Course satisfaction %", teaching_pct: "Teaching %",
  employment_pct: "In work/study %", salary_15m: "Salary 15 months (£)", salary_5y: "Salary 5 years (£)", placement: "Placement year", year_abroad: "Year abroad",
  fees_home: "Fees (£/yr)", ucas_code: "UCAS code", degree: "Degree", years: "Years", modules: "Key modules", assessment: "Assessment",
  city: "City", region: "Region", setting: "Setting", russell_group: "Russell Group", founded: "Founded", students_total: "Students", undergrads: "Undergraduates",
  postgrads: "Postgraduates", intl_pct: "International %", female_pct: "Female %", state_school_pct: "State school %", satisfaction_pct_u: "Satisfaction %",
  continuation_pct: "Continuation %", graduate_prospects_pct: "Graduate prospects %", median_salary: "Median salary (£)", entry_tariff: "Entry tariff (UCAS pts)",
  rank_cug: "Rank: Complete Uni Guide", rank_guardian: "Rank: Guardian", rank_times: "Rank: Times", rank_qs: "Rank: QS world", accommodation_cost_week: "Accommodation (£/week)",
  living_cost_rating: "Cost of living", sports: "Sport", clubs: "Societies",
};
const SKIP = new Set(["id", "created_at", "updated_at", "sources", "notes", "uni_id", "name", "uni", "status", "rating", "url", "website", "shortlisted", "lat", "lon", "country"]);
const fmt = (v: unknown) => (typeof v === "boolean" ? (v ? "Yes" : "No") : typeof v === "number" ? v.toLocaleString("en-GB") : String(v));

function Detail({ r, table, onChange, predicted }: { r: Row; table: "courses" | "unis"; onChange: () => void; predicted: string[] }) {
  const [notes, setNotes] = useState(r.notes ?? "");
  const offer = parseOffer(r.typical_offer);
  const gap = meets(offer, predicted);
  return (
    <div style={{ display: "grid", gap: 10, padding: 14, borderRadius: 12, background: "var(--surface)" }}>
      <div className={u.row}>
        <b style={{ fontSize: 17, flex: 1 }}>{r.name}{table === "courses" ? <span className="label"> · {r.uni}</span> : null}</b>
        {[1, 2, 3, 4, 5].map((n) => <button key={n} aria-label={`${n} stars`} onClick={async () => { await save("update", table, { rating: n }, r.id); onChange(); }} style={{ color: (r.rating ?? 0) >= n ? "#f5a524" : "var(--text-dim)", fontSize: 18 }}>★</button>)}
        {table === "courses"
          ? <select style={field} value={r.status} onChange={async (e) => { await save("update", "courses", { status: e.target.value }, r.id); onChange(); }}>{STATUS.map((x) => <option key={x}>{x}</option>)}</select>
          : <button className="pill" data-active={r.shortlisted} onClick={async () => { await save("update", "unis", { shortlisted: !r.shortlisted }, r.id); onChange(); }}>{r.shortlisted ? "★ Shortlisted" : "Shortlist"}</button>}
      </div>
      {table === "courses" && offer.length > 0 && (
        <div style={{ padding: "8px 10px", borderRadius: 8, background: gap === 0 ? "color-mix(in srgb, var(--good) 18%, transparent)" : gap == null ? "var(--surface-2)" : "color-mix(in srgb, var(--danger) 15%, transparent)", fontSize: 13.5 }}>
          Offer <b>{r.typical_offer}</b> · your predicted grades <b>{predicted.length ? predicted.join("") : "not enough data yet"}</b>{" "}
          {gap === 0 ? "✓ you meet it" : gap == null ? "" : `· ${gap} grade${gap === 1 ? "" : "s"} short`}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 6 }}>
        {Object.entries(r).filter(([k, v]) => !SKIP.has(k) && v != null && v !== "").map(([k, v]) => (
          <div key={k} style={{ padding: "6px 8px", borderRadius: 6, background: "var(--surface-2)" }}>
            <small className="label">{LABEL[k === "satisfaction_pct" && table === "unis" ? "satisfaction_pct_u" : k] ?? k.replace(/_/g, " ")}</small>
            <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{fmt(v)}</div>
          </div>
        ))}
      </div>
      <div className={u.row}>
        {(r.url || r.website) && <a className="pill" href={r.url ?? r.website} target="_blank" rel="noreferrer">Official page ↗</a>}
        {r.lat && r.lon && <a className="pill" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lon}#map=13/${r.lat}/${r.lon}`} target="_blank" rel="noreferrer">Map ↗</a>}
      </div>
      <textarea rows={2} placeholder="Your notes (open day impressions, pros/cons…)" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => save("update", table, { notes }, r.id)} style={{ ...field, height: "auto", padding: 8 }} />
      {(r.sources ?? []).length > 0 && (
        <small className="label">Sources: {(r.sources as { url: string; title?: string }[]).map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{s.title || new URL(s.url).hostname}</a>)}</small>
      )}
    </div>
  );
}

function UkMap({ unis, onPick }: { unis: Row[]; onPick: (r: Row) => void }) {
  const pts = unis.filter((x) => x.lat != null && x.lon != null);
  // equirectangular around the UK: lon -8..2, lat 49.8..59
  const X = (lon: number) => ((Number(lon) + 8) / 10) * 300, Y = (lat: number) => ((59 - Number(lat)) / 9.2) * 480;
  if (!pts.length) return <div className="label">Universities appear here once they have a location.</div>;
  return (
    <svg viewBox="0 0 300 480" style={{ width: "100%", maxWidth: 360, background: "var(--surface)", borderRadius: 12 }}>
      {[50, 52, 54, 56, 58].map((l) => <g key={l}><line x1="0" x2="300" y1={Y(l)} y2={Y(l)} stroke="var(--border)" strokeDasharray="2 4" /><text x="2" y={Y(l) - 2} fontSize="8" fill="var(--text-dim)">{l}°N</text></g>)}
      {[["London", 51.51, -0.13], ["Birmingham", 52.49, -1.89], ["Manchester", 53.48, -2.24], ["Edinburgh", 55.95, -3.19], ["Cardiff", 51.48, -3.18], ["Belfast", 54.6, -5.93]].map(([n, la, lo]) => <text key={n as string} x={X(lo as number) + 4} y={Y(la as number) + 10} fontSize="7" fill="var(--text-dim)">{n}</text>)}
      {pts.map((p) => (
        <g key={p.id} onClick={() => onPick(p)} style={{ cursor: "pointer" }}>
          <circle cx={X(p.lon)} cy={Y(p.lat)} r={p.shortlisted ? 6 : 4} fill={p.shortlisted ? "var(--accent)" : "var(--text-dim)"} stroke="var(--bg)" />
          <title>{p.name}</title>
          {p.shortlisted && <text x={X(p.lon) + 7} y={Y(p.lat) + 3} fontSize="8" fill="var(--text)">{p.name}</text>}
        </g>
      ))}
    </svg>
  );
}

export function UniExplorer({ ctx }: { ctx: BlockCtx }) {
  const { changes } = useApollo();
  const [tab, setTab] = useState<"courses" | "unis" | "compare" | "map">("courses");
  const [courses, setCourses] = useState<Row[]>([]);
  const [unis, setUnis] = useState<Row[]>([]);
  const [predicted, setPredicted] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("");
  const [rg, setRg] = useState(false);
  const [sort, setSort] = useState("rank");
  const [sel, setSel] = useState<{ table: "courses" | "unis"; id: string } | null>(null);
  const [cmp, setCmp] = useState<string[]>([]);
  const [research, setResearch] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    data([{ table: "courses", limit: 500 }, { table: "unis", limit: 500 }]).then(([c, x]) => { setCourses(c?.rows ?? []); setUnis(x?.rows ?? []); });
    fetch("/api/school-analysis").then((r) => (r.ok ? r.json() : null)).then((a) => { if (a) setPredicted((a.subjects as { grade: string | null }[]).map((s) => s.grade).filter((g): g is string => !!g && g !== "U")); }).catch(() => {});
  }, [changes, tick, ctx.data]);
  const uniOf = (name: string) => unis.find((x) => x.name === name);
  const regions = [...new Set(unis.map((x) => x.region).filter(Boolean))].sort();
  const match = (txt: string) => !q || txt.toLowerCase().includes(q.toLowerCase());
  const cs = useMemo(() => courses.filter((c) => match(`${c.name} ${c.uni} ${c.modules ?? ""}`) && (!region || uniOf(c.uni)?.region === region) && (!rg || uniOf(c.uni)?.russell_group))
    .sort((a, b) => {
      const ua = uniOf(a.uni), ub = uniOf(b.uni);
      if (sort === "rank") return (ua?.rank_cug ?? 999) - (ub?.rank_cug ?? 999);
      if (sort === "offer") return parseOffer(b.typical_offer).length && parseOffer(a.typical_offer).length ? (meets(parseOffer(b.typical_offer), ["A*", "A*", "A*", "A*"]) ?? 0) - 0 : 0;
      return (Number(b[sort]) || 0) - (Number(a[sort]) || 0);
    }), [courses, unis, q, region, rg, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const us = useMemo(() => unis.filter((x) => match(`${x.name} ${x.city ?? ""}`) && (!region || x.region === region) && (!rg || x.russell_group))
    .sort((a, b) => (sort === "rank" ? (a.rank_cug ?? 999) - (b.rank_cug ?? 999) : (Number(b[sort === "satisfaction_pct" ? "satisfaction_pct" : sort]) || 0) - (Number(a[sort]) || 0))), [unis, q, region, rg, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = sel ? (sel.table === "courses" ? courses : unis).find((x) => x.id === sel.id) : null;
  const cmpRows = courses.filter((c) => cmp.includes(c.id));
  const CMP_FIELDS = ["typical_offer", "required_subjects", "admissions_test", "applicants_per_place", "offer_rate_pct", "satisfaction_pct", "employment_pct", "salary_15m", "salary_5y", "placement", "year_abroad", "years", "fees_home"];
  const UNI_CMP = ["rank_cug", "rank_guardian", "students_total", "satisfaction_pct", "graduate_prospects_pct", "accommodation_cost_week", "city", "setting"];
  const best = (k: string, rows: Row[]) => { const vals = rows.map((r) => Number(r[k])).filter((v) => Number.isFinite(v)); if (vals.length < 2) return null; return /rank|applicants|cost|fees/.test(k) ? Math.min(...vals) : Math.max(...vals); };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={u.row}>
        <input style={{ ...field, flex: 1, minWidth: 240 }} placeholder="Research with Apollo, e.g. “Physics at Durham, Bath, Bristol and Warwick”" value={research} onChange={(e) => setResearch(e.target.value)} />
        <button className="pill" data-active="true" disabled={research.trim().length < 4} onClick={async () => {
          const r = await fetch("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "uni", query: research }) }).then((x) => x.json()).catch(() => null);
          setMsg(r?.id ? `Researching on the web${r.relayOnline ? "" : " (queued until your PC's relay is online)"}: results appear here with sources in a few minutes.` : "Couldn't queue it."); setResearch("");
        }}>Research</button>
      </div>
      {msg && <small className="label">{msg}</small>}
      <div className={u.row}>
        {(["courses", "unis", "compare", "map"] as const).map((t) => <button key={t} className="pill" data-active={tab === t} onClick={() => setTab(t)}>{t === "unis" ? `Universities (${unis.length})` : t === "courses" ? `Courses (${courses.length})` : t === "compare" ? `Compare (${cmp.length})` : "Map"}</button>)}
        <input style={field} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={field} value={region} onChange={(e) => setRegion(e.target.value)}><option value="">All regions</option>{regions.map((r) => <option key={r}>{r}</option>)}</select>
        <label className={u.row} style={{ fontSize: 13 }}><input type="checkbox" checked={rg} onChange={(e) => setRg(e.target.checked)} /> Russell Group</label>
        <select style={field} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="rank">Sort: ranking</option><option value="satisfaction_pct">Satisfaction</option><option value="employment_pct">Employment</option><option value="salary_15m">Salary</option><option value="offer_rate_pct">Offer rate</option>
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: selected && tab !== "compare" ? "minmax(0, 1fr) minmax(0, 1.3fr)" : "1fr", gap: 12, alignItems: "start" }}>
        {tab === "courses" && (
          <div style={{ display: "grid", gap: 4 }}>
            {cs.map((c) => { const g = meets(parseOffer(c.typical_offer), predicted); return (
              <div key={c.id} onClick={() => setSel({ table: "courses", id: c.id })} style={{ padding: "8px 10px", borderRadius: 8, background: sel?.id === c.id ? "var(--surface-2)" : "var(--surface)", cursor: "pointer", display: "grid", gap: 2 }}>
                <div className={u.row}>
                  <b style={{ flex: 1 }}>{c.name}</b>
                  {c.typical_offer && <span className="pill" style={{ borderColor: g === 0 ? "var(--good)" : g ? "var(--danger)" : undefined }}>{c.typical_offer}</span>}
                  <input type="checkbox" title="Compare" checked={cmp.includes(c.id)} onClick={(e) => e.stopPropagation()} onChange={() => setCmp(cmp.includes(c.id) ? cmp.filter((x) => x !== c.id) : [...cmp, c.id].slice(-4))} />
                </div>
                <small className="label">{c.uni}{uniOf(c.uni)?.rank_cug ? ` · CUG #${uniOf(c.uni)!.rank_cug}` : ""}{c.satisfaction_pct ? ` · ${c.satisfaction_pct}% satisfied` : ""}{c.employment_pct ? ` · ${c.employment_pct}% employed` : ""}{c.salary_15m ? ` · £${Number(c.salary_15m).toLocaleString("en-GB")}` : ""} · {c.status}</small>
              </div>
            ); })}
            {!cs.length && <span className="label">No courses yet. Ask Apollo to research some above, or add one below.</span>}
          </div>
        )}
        {tab === "unis" && (
          <div style={{ display: "grid", gap: 4 }}>
            {us.map((x) => (
              <div key={x.id} onClick={() => setSel({ table: "unis", id: x.id })} style={{ padding: "8px 10px", borderRadius: 8, background: sel?.id === x.id ? "var(--surface-2)" : "var(--surface)", cursor: "pointer" }}>
                <div className={u.row}><b style={{ flex: 1 }}>{x.shortlisted ? "★ " : ""}{x.name}</b>{x.rank_cug && <span className="label">#{x.rank_cug}</span>}</div>
                <small className="label">{[x.city, x.region, x.setting, x.russell_group ? "Russell Group" : null, x.students_total ? `${Number(x.students_total).toLocaleString("en-GB")} students` : null, x.satisfaction_pct ? `${x.satisfaction_pct}% satisfied` : null].filter(Boolean).join(" · ")}</small>
              </div>
            ))}
            {!us.length && <span className="label">No universities yet.</span>}
          </div>
        )}
        {tab === "map" && <UkMap unis={unis} onPick={(r) => setSel({ table: "unis", id: r.id })} />}
        {tab === "compare" && (cmpRows.length < 2 ? <span className="label">Tick 2-4 courses in the Courses tab to compare them.</span> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th />{cmpRows.map((c) => <th key={c.id} style={{ padding: 6, textAlign: "left" }}>{c.name}<br /><small className="label">{c.uni}</small></th>)}</tr></thead>
              <tbody>
                {CMP_FIELDS.map((k) => { const b = best(k, cmpRows); return (
                  <tr key={k} style={{ borderTop: "1px solid var(--border)" }}><td style={{ padding: 6 }} className="label">{LABEL[k] ?? k}</td>
                    {cmpRows.map((c) => <td key={c.id} style={{ padding: 6, fontWeight: b != null && Number(c[k]) === b ? 700 : 400, color: b != null && Number(c[k]) === b ? "var(--good)" : undefined }}>{c[k] == null ? "—" : fmt(c[k])}</td>)}</tr>
                ); })}
                {UNI_CMP.map((k) => { const rows = cmpRows.map((c) => uniOf(c.uni) ?? ({} as Row)); const b = best(k, rows); return (
                  <tr key={`u${k}`} style={{ borderTop: "1px solid var(--border)" }}><td style={{ padding: 6 }} className="label">Uni: {LABEL[k === "satisfaction_pct" ? "satisfaction_pct_u" : k] ?? k}</td>
                    {rows.map((r, i) => <td key={i} style={{ padding: 6, fontWeight: b != null && Number(r[k]) === b ? 700 : 400, color: b != null && Number(r[k]) === b ? "var(--good)" : undefined }}>{r[k] == null ? "—" : fmt(r[k])}</td>)}</tr>
                ); })}
                <tr style={{ borderTop: "1px solid var(--border)" }}><td style={{ padding: 6 }} className="label">Meets your predicted grades</td>
                  {cmpRows.map((c) => { const g = meets(parseOffer(c.typical_offer), predicted); return <td key={c.id} style={{ padding: 6 }}>{g == null ? "—" : g === 0 ? "✓ yes" : `${g} grade${g === 1 ? "" : "s"} short`}</td>; })}</tr>
              </tbody>
            </table>
          </div>
        ))}
        {selected && tab !== "compare" && <Detail key={selected.id} r={selected} table={sel!.table} predicted={predicted} onChange={() => setTick((t) => t + 1)} />}
      </div>
      <details>
        <summary className="label" style={{ cursor: "pointer" }}>Add a course yourself</summary>
        <AddCourse onDone={() => setTick((t) => t + 1)} />
      </details>
    </div>
  );
}

function AddCourse({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ uni: "", name: "", typical_offer: "", url: "" });
  return (
    <div className={u.row} style={{ marginTop: 8 }}>
      {(["uni", "name", "typical_offer", "url"] as const).map((k) => <input key={k} style={field} placeholder={k === "typical_offer" ? "Offer, e.g. A*AA" : k === "name" ? "Course" : k === "uni" ? "University" : "Course page url"} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />)}
      <button className="pill" disabled={!f.uni || !f.name} onClick={async () => { await save("create", "courses", { ...f, status: "interested", sources: [] }); setF({ uni: "", name: "", typical_offer: "", url: "" }); onDone(); }}>Add</button>
    </div>
  );
}
