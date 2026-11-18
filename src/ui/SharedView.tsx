"use client";
// What a friend sees from a share link: a read-only document, a flashcard deck to flip through, or a quiz
// with mark schemes. No login, nothing else of the site.
import { useEffect, useState } from "react";
import { RichText } from "./RichText";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
export function SharedView({ token }: { token: string }) {
  const [d, setD] = useState<A>(null);
  const [i, setI] = useState(0);
  const [flip, setFlip] = useState(false);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  useEffect(() => { fetch(`/api/share/${token}`).then((r) => r.json()).then(setD).catch(() => setD({ error: "Couldn't open this link." })); }, [token]);
  const wrap: React.CSSProperties = { maxWidth: 820, margin: "0 auto", padding: "28px 16px", display: "grid", gap: 14 };
  if (!d) return <div style={wrap}>Loading…</div>;
  if (d.error) return <div style={wrap}>{d.error}</div>;
  if (d.kind === "doc") return (
    <div style={{ ...wrap, background: "#fff", color: "#111", borderRadius: 8, marginTop: 20 }}>
      <h1 style={{ margin: 0 }}>{d.doc.title}</h1>{d.doc.subtitle && <p style={{ color: "#555" }}>{d.doc.subtitle}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {(d.doc.sections ?? []).map((s: A, k: number) => <section key={k}>{s.heading && <h2>{s.heading}</h2>}<RichText text={s.body ?? ""} />{s.figure?.url && <figure><img src={s.figure.url} alt={s.figure.caption ?? ""} style={{ maxWidth: "100%" }} referrerPolicy="no-referrer" /><figcaption style={{ fontSize: 12, color: "#666" }}>{s.figure.caption} {s.figure.credit}</figcaption></figure>}</section>)}
    </div>
  );
  if (d.kind === "deck") {
    const c = d.cards[i];
    return (
      <div style={wrap}>
        <h1 style={{ margin: 0 }}>{d.title}</h1><span>{i + 1} / {d.cards.length}</span>
        {c && <div onClick={() => setFlip(!flip)} style={{ minHeight: 200, padding: 24, borderRadius: 14, background: "var(--surface)", cursor: "pointer", fontSize: 18 }}><RichText text={flip ? c.back : c.front} /><small style={{ opacity: 0.6 }}>{flip ? "answer" : "tap to flip"}</small></div>}
        <div style={{ display: "flex", gap: 8 }}><button className="pill" disabled={i === 0} onClick={() => { setI(i - 1); setFlip(false); }}>◀</button><button className="pill" disabled={i >= d.cards.length - 1} onClick={() => { setI(i + 1); setFlip(false); }}>▶</button><button className="pill" onClick={() => { setI(Math.floor(Math.random() * d.cards.length)); setFlip(false); }}>Shuffle</button></div>
      </div>
    );
  }
  return (
    <div style={wrap}>
      <h1 style={{ margin: 0 }}>{d.title}</h1>
      {d.questions.map((q: A, k: number) => (
        <div key={k} style={{ padding: 14, borderRadius: 12, background: "var(--surface)" }}>
          <b>{k + 1}.</b> <span style={{ opacity: 0.7 }}>[{q.marks} marks]</span><RichText text={q.question} />
          {q.mark_scheme && (shown[k] ? <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: "var(--surface-2)" }}><RichText text={q.mark_scheme} /></div> : <button className="pill" onClick={() => setShown({ ...shown, [k]: true })}>Show mark scheme</button>)}
        </div>
      ))}
    </div>
  );
}
