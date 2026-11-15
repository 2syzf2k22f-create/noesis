"use client";
// School > Spec: Subject > Topic > Subtopic > content statements (exact official wording), with
// confidence 1-5, review marks, linked evidence counts, progress per node, search and filters.

import { hasMath, RichText } from "./RichText";
import { useEffect, useMemo, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { usePersist } from "./usePersist";
import u from "./ui.module.css";
import { useTests } from "./UpcomingTests";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = { id: string; subject: string; code: string; title: string | null; text: string | null; notes: string | null; examples: string | null; level: number; parent_code: string | null; sort_order: number | null; paper: string | null; optional: boolean; chosen: boolean; source_url: string | null; source_version: string | null; source_page: number | null; verified: boolean; verified_at: string | null; previous_text: string | null; confidence: number | null; last_reviewed_at: string | null; evidence: { cards: number; questions: number; attempts: number; attempt_pct: number | null; tests: number; mistakes: number; minutes: number; notes: number; resources: number } };
const SUBJECTS = ["Maths", "Further Maths", "Physics", "Economics"];
export const CONF_COLOR = ["var(--surface-2)", "#e5484d", "#f5a524", "#e2c044", "#7ac77a", "#30a46c"];
const CONF_LABEL = ["Not rated", "No idea", "Shaky", "Getting there", "Good", "Exam-ready"];
const byCode = (a: P, b: P) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code, undefined, { numeric: true });
const evidenceCount = (e: P["evidence"]) => e.cards + e.questions + e.attempts + e.tests;

export function SpecBlock() {
  const { submit } = useApollo();
  const [subject, setSubject] = usePersist("spec.subject", "Maths");
  const [rows, setRows] = useState<P[] | null>(null);
  const [sel, setSel] = usePersist<string | null>("spec.sel", null);
  const [q, setQ] = useState("");
  const [conf, setConf] = useState<"" | "unrated" | "weak" | "strong">("");
  const [showOptional, setShowOptional] = useState(true);
  const [chosenOnly, setChosenOnly] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [tests] = useTests();
  // links from a test page: /s/school/spec?subject=Maths&code=1.02d
  useEffect(() => {
    const q = new URLSearchParams(location.search), sub = q.get("subject"), code = q.get("code");
    if (sub) queueMicrotask(() => { setSubject(sub); if (code) setSel(code); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onTests = (code: string) => (tests?.upcoming ?? []).filter((t: any) => t.subject === subject && (t.codes ?? []).some((c: string) => code === c || code.startsWith(c)));
  const load = () => fetch(`/api/spec?subject=${encodeURIComponent(subject)}`).then((r) => (r.ok ? r.json() : null)).then((j) => setRows(j?.rows ?? [])).catch(() => setRows([]));
  useEffect(() => { void load(); }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps
  const post = async (b: object) => { await fetch("/api/spec", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }); void load(); };

  const all = useMemo(() => (rows ?? []).filter((r) => (showOptional || !r.optional) && (!chosenOnly || r.chosen)).sort(byCode), [rows, showOptional, chosenOnly]);
  const kids = useMemo(() => { const m = new Map<string, P[]>(); for (const r of all) { const k = r.parent_code ?? ""; m.set(k, [...(m.get(k) ?? []), r]); } return m; }, [all]);
  const codes = useMemo(() => new Set(all.map((r) => r.code)), [all]);
  const roots = all.filter((r) => !r.parent_code || !codes.has(r.parent_code));
  const under = (code: string): P[] => (kids.get(code) ?? []).flatMap((k) => [k, ...under(k.code)]);
  const statementsUnder = (code: string | null) => (code ? [all.find((r) => r.code === code)!, ...under(code)] : all).filter((r) => r && r.level === 4);
  const matches = (r: P) => {
    if (q && !`${r.code} ${r.title ?? ""} ${r.text ?? ""} ${r.notes ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (conf === "unrated" && r.confidence != null) return false;
    if (conf === "weak" && !(r.confidence != null && r.confidence <= 2)) return false;
    if (conf === "strong" && !(r.confidence != null && r.confidence >= 4)) return false;
    return true;
  };
  const progress = (list: P[]) => {
    const rated = list.filter((r) => r.confidence != null);
    return { n: list.length, rated: rated.length, avg: rated.length ? rated.reduce((a, r) => a + Number(r.confidence), 0) / rated.length : null, bare: list.filter((r) => evidenceCount(r.evidence) === 0).length };
  };
  const filtering = !!q || !!conf;
  const shown = (filtering ? all.filter((r) => r.level >= 3 || r.text) : sel ? [all.find((r) => r.code === sel), ...under(sel)].filter(Boolean) as P[] : []).filter(matches);
  const sources = [...new Map((rows ?? []).filter((r) => r.source_version).map((r) => [r.source_version, r])).values()];
  const unverified = (rows ?? []).filter((r) => !r.verified).length;

  const Node = ({ r, depth }: { r: P; depth: number }) => {
    const ch = (kids.get(r.code) ?? []).filter((k) => k.level < 4);
    const pr = progress(statementsUnder(r.code));
    const isOpen = open.has(r.code);
    return (
      <div>
        <div className={u.row} style={{ gap: 4, paddingLeft: depth * 12, borderRadius: 6, background: sel === r.code ? "var(--surface-2)" : undefined }}>
          {ch.length > 0 ? <button className="pill" style={{ padding: "0 6px", minWidth: 22 }} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(r.code)) n.delete(r.code); else n.add(r.code); return n; })}>{isOpen ? "▾" : "▸"}</button> : <span style={{ width: 22 }} />}
          <button onClick={() => setSel(r.code)} style={{ flex: 1, textAlign: "left", background: "none", border: 0, color: "inherit", cursor: "pointer", padding: "4px 2px", font: "inherit", fontSize: 13, minWidth: 0 }}>
            <b>{r.code}</b> {r.title}{r.optional && <span className="label"> · option{r.chosen ? "" : " (not chosen)"}</span>}{!r.verified && <span style={{ color: "var(--danger)" }}> ·</span>}
            {pr.n > 0 && <span style={{ display: "block", height: 4, borderRadius: 2, marginTop: 3, background: `linear-gradient(90deg, ${CONF_COLOR[Math.round(pr.avg ?? 0)]} ${(pr.rated / pr.n) * 100}%, var(--surface-2) 0)` }} title={`${pr.rated}/${pr.n} rated · avg ${pr.avg?.toFixed(1) ?? "–"} · ${pr.bare} with no flashcards/questions`} />}
          </button>
        </div>
        {isOpen && ch.map((c) => <Node key={c.code} r={c} depth={depth + 1} />)}
      </div>
    );
  };

  const selRow = sel ? all.find((r) => r.code === sel) : null;
  const pr = progress(statementsUnder(sel));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className={u.row} style={{ flexWrap: "wrap" }}>
        {SUBJECTS.map((s2) => <button key={s2} className="pill" data-active={subject === s2} onClick={() => { setSubject(s2); setSel(null); }}>{s2}</button>)}
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        {sources.map((r) => <span key={r.source_version} className="pill" title={r.source_url ?? ""}>📄 {r.source_version}{r.verified_at ? ` · verified ${new Date(r.verified_at).toLocaleDateString("en-GB")}` : ""}</span>)}
        {sources.length === 0 && <span className="pill" style={{ color: "var(--danger)" }}>No official text imported yet</span>}
        {unverified > 0 && <span className="pill" style={{ color: "var(--danger)" }} title="Not yet checked word-for-word against the official PDF">{unverified} unverified</span>}
        <button className="pill" onClick={() => submit(`Import the full official ${subject} specification into School > Spec. Find the official PDF from the exam board's site (${({ Maths: "OCR A Level Maths A H240", "Further Maths": "OCR A Level Further Maths A H245", Physics: "AQA A Level Physics 7408, latest version", Economics: "Pearson Edexcel A Level Economics A 9EC0" } as Record<string, string>)[subject]}). web_read it page by page until 'more' is null, and send every section, topic, subtopic and content statement with import_spec_points (exact wording; notes/guidance in notes), in batches, in order. Fix and resend anything it reports unverified. Then run spec_report and tell me the counts, gaps and anything still unverified. Don't stop until the whole content section is covered.`)}>⟳ Import / re-verify with Apollo</button>
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 6 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code or words…" style={{ flex: "1 1 200px", height: 34, padding: "0 10px", borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }} />
        {(["", "unrated", "weak", "strong"] as const).map((k) => <button key={k} className="pill" data-active={conf === k} onClick={() => setConf(k)}>{k || "All"}</button>)}
        <label className="label" style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={showOptional} onChange={(e) => setShowOptional(e.target.checked)} />Show options</label>
        <label className="label" style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="checkbox" checked={chosenOnly} onChange={(e) => setChosenOnly(e.target.checked)} />Chosen options only</label>
      </div>
      {!rows ? <div className="label">Loading…</div> : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 300px) minmax(0, 1fr)", gap: 12, alignItems: "start" }} data-spec-layout>
          <div style={{ maxHeight: "70vh", overflow: "auto", display: "grid", gap: 1 }}>
            {roots.length === 0 && <span className="label">Nothing imported for {subject} yet.</span>}
            {roots.map((r) => <Node key={r.code} r={r} depth={0} />)}
          </div>
          <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
            {selRow && !filtering && (
              <div style={{ display: "grid", gap: 4 }}>
                <b>{selRow.code} {selRow.title}</b>
                <small className="label">{pr.n} statements · {pr.rated} rated · avg confidence {pr.avg?.toFixed(1) ?? "–"} · {pr.bare} with no flashcards or questions{selRow.paper ? ` · ${selRow.paper}` : ""}</small>
                {selRow.optional && <label className="label" style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={selRow.chosen} onChange={(e) => post({ subject, code: selRow.code, chosen: e.target.checked })} /> I&apos;m taking this option</label>}
              </div>
            )}
            {!sel && !filtering && <span className="label">Pick a topic on the left, or search.</span>}
            {shown.filter((r) => r.level === 4 || r.text).map((r) => <Statement key={r.id} r={r} tests={onTests(r.code)} onSet={(c) => post({ id: r.id, confidence: c })} onReviewed={() => post({ id: r.id, reviewed: true })}
              onAsk={(what) => submit(`${what} ${r.subject} spec ${r.code}${r.verified ? "" : " (unverified)"}: "${r.text ?? r.title}". Use get_spec for the exact wording and set spec_code ${r.code} on anything you create.`, { thread: `spec:${r.subject}` })} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Statement({ r, tests, onSet, onReviewed, onAsk }: { r: P; tests: any[]; onSet: (c: number | null) => void; onReviewed: () => void; onAsk: (what: string) => void }) {
  const e = r.evidence;
  return (
    <div style={{ padding: 10, borderRadius: 10, background: "var(--surface)", borderLeft: `4px solid ${CONF_COLOR[r.confidence ?? 0]}`, display: "grid", gap: 6 }}>
      <div className={u.row} style={{ alignItems: "baseline", gap: 8 }}>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>{r.code}</b>
        {tests.map((t) => <a key={t.id} href={`/s/school/tests/${t.id}`} className="pill" style={{ height: 20, fontSize: 10.5, background: "var(--danger)", color: "#fff", whiteSpace: "nowrap" }}>on test: {t.subject} {new Date(`${t.date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</a>)}
        <span style={{ flex: 1, whiteSpace: "pre-line" }}>{r.title && r.text ? <b>{r.title}. </b> : null}{hasMath(r.text ?? r.title ?? "") ? <RichText text={r.text ?? r.title} inline={!String(r.text ?? "").includes("\n")} /> : r.text ?? r.title}</span>
      </div>
      {r.notes && <small style={{ whiteSpace: "pre-wrap", color: "var(--text-dim)" }}>{hasMath(r.notes) ? <RichText text={r.notes} /> : r.notes}</small>}
      {r.examples && <details><summary className="label" style={{ cursor: "pointer" }}>Examples</summary><small style={{ whiteSpace: "pre-wrap" }}>{r.examples}</small></details>}
      {r.previous_text && <details><summary className="label" style={{ cursor: "pointer", color: "#f5a524" }}>Changed in the latest version</summary><small style={{ whiteSpace: "pre-wrap" }}>Before: {r.previous_text}</small></details>}
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((c) => <button key={c} className="pill" title={CONF_LABEL[c]} onClick={() => onSet(r.confidence === c ? null : c)} style={{ background: r.confidence === c ? CONF_COLOR[c] : undefined, color: r.confidence === c ? "#111" : undefined, minWidth: 30 }}>{c}</button>)}
        <button className="pill" onClick={onReviewed} title={r.last_reviewed_at ? `Last reviewed ${new Date(r.last_reviewed_at).toLocaleDateString("en-GB")}` : "Never reviewed"}>✓ Reviewed</button>
        <small className="label" style={{ marginLeft: "auto" }}>
          🃏 {e.cards} · ❓ {e.questions} · ✍ {e.attempts}{e.attempt_pct != null ? ` (${e.attempt_pct}%)` : ""} · 📝 {e.tests} · ⚠ {e.mistakes} · ⏱ {e.minutes}m
        </small>
      </div>
      <div className={u.row} style={{ flexWrap: "wrap", gap: 4 }}>
        <button className="pill" onClick={() => onAsk("Teach me, step by step, then check my understanding:")}>Teach me</button>
        <button className="pill" onClick={() => onAsk("Write 3 exam-style questions (save them to my question bank) on")}>Questions</button>
        <button className="pill" onClick={() => onAsk("Make 5 flashcards (save them) for")}>Flashcards</button>
        <button className="pill" onClick={() => onAsk("Find one good video and one good explanation page (save as resource links) for")}>Find resources</button>
        <small className="label" style={{ marginLeft: "auto" }}>{r.verified ? `✓ ${r.source_version ?? ""}${r.source_page ? ` p.${r.source_page}` : ""}` : <span style={{ color: "var(--danger)" }}>unverified</span>}</small>
      </div>
    </div>
  );
}
