"use client";
// Renders a document Apollo made as a real piece of work: cover page, contents, numbered sections and
// figures with credits, CV sidebar, poster grid or slides; prints to a clean A4 PDF; exports to Word;
// edit any section yourself or ask Apollo to change it (chat on the page). Slides have a presenter mode.
import { useCallback, useEffect, useState } from "react";
import { RichText } from "./RichText";
import { RoomChat } from "./RoomChat";
import d from "./doc.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const ACCENTS: Record<string, string> = { modern: "#2563eb", classic: "#7c2d12", academic: "#1f2937", minimal: "#111827", bold: "#db2777" };

export function DocView({ id }: { id: string }) {
  const [doc, setDoc] = useState<A>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<number | null>(null);
  const [chat, setChat] = useState<string | null>(null);
  const [present, setPresent] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    fetch(`/api/files/${id}`).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))).then((t) => setDoc(JSON.parse(t))).catch(() => setErr("Couldn't open this document."));
    fetch(`/api/chats?space=doc:${id}`).then((r) => r.json()).then((j) => { if (Array.isArray(j) && j[0]) setChat(j[0].id); }).catch(() => {});
  }, [id, tick]);
  // Apollo edits the document from the chat: reload after each of its replies
  useEffect(() => { const f = () => setTick((t) => t + 1); window.addEventListener("noesis:doc-changed", f); const t = setInterval(f, 15000); return () => { window.removeEventListener("noesis:doc-changed", f); clearInterval(t); }; }, []);
  const save = useCallback(async (next: A) => {
    setDoc(next);
    await fetch("/api/docs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", id, doc: next }) });
  }, [id]);
  if (err) return <div style={{ padding: 24 }}>{err}</div>;
  if (!doc) return <div className="label" style={{ padding: 24 }}>Loading…</div>;
  const accent = doc.accent ?? ACCENTS[doc.theme ?? "modern"] ?? "#2563eb";
  const exportWord = () => {
    const el = document.getElementById("doc-root"); if (!el) return;
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${doc.title}</title><style>body{font-family:Calibri,Arial;font-size:11pt} h1{color:${accent}} h2{color:${accent}} img{max-width:16cm} figcaption{font-size:9pt;color:#555} table{border-collapse:collapse} td,th{border:1px solid #999;padding:4px}</style></head><body>${el.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, "")}</body></html>`;
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿", html], { type: "application/msword" })); a.download = `${doc.title}.doc`; a.click();
  };
  let fig = 0;
  const sections: A[] = doc.sections ?? [];
  const figure = (f: A) => { if (!f?.url) return null; fig++; return (
    <figure className={d.fig} data-w={f.width ?? "medium"} data-side={f.side ?? "center"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={f.url} alt={f.caption ?? ""} referrerPolicy="no-referrer" />
      <figcaption>{doc.numbered !== false ? <b>Figure {fig}. </b> : null}{f.caption}{f.credit ? <span className={d.credit}> · {f.credit}</span> : null}</figcaption>
    </figure>); };
  const sectionEl = (s: A, i: number) => (
    <section key={i} className={d.section} data-layout={s.layout ?? "text"} data-break={s.page_break ? "1" : undefined} onDoubleClick={() => setEdit(i)}>
      {s.heading && (s.level === 3 ? <h3>{s.heading}</h3> : s.level === 2 ? <h3>{s.heading}</h3> : <h2>{doc.numbered && doc.kind !== "cv" && doc.kind !== "letter" && doc.kind !== "slides" ? `${sections.filter((x, j) => j <= i && x.heading && (x.level ?? 1) === 1).length}. ` : ""}{s.heading}</h2>)}
      {s.layout === "figure-left" || s.layout === "figure-right" ? <div className={d.split} data-flip={s.layout === "figure-right" ? "1" : undefined}>{figure(s.figure)}<div><RichText text={s.body ?? ""} /></div></div>
        : <>{s.layout === "callout" ? <div className={d.callout}><RichText text={s.body ?? ""} /></div> : <div className={s.layout === "two-column" ? d.cols : undefined}><RichText text={s.body ?? ""} /></div>}{figure(s.figure)}</>}
      {edit === i && <SectionEditor s={s} onCancel={() => setEdit(null)} onSave={(ns) => { const next = { ...doc, sections: sections.map((x, j) => (j === i ? ns : x)) }; setEdit(null); void save(next); }} onDelete={() => { setEdit(null); void save({ ...doc, sections: sections.filter((_, j) => j !== i) }); }} />}
    </section>
  );
  if (present != null && doc.kind === "slides") return <Presenter doc={doc} i={present} setI={setPresent} accent={accent} />;
  return (
    <div className={d.page}>
      <div className={d.bar}>
        <b style={{ flex: 1 }}>{doc.title}</b>
        <small className="label">{doc.kind} · double-click a section to edit it</small>
        {doc.kind === "slides" && <button className="pill" data-active="true" onClick={() => setPresent(0)}>▶ Present</button>}
        <button className="pill" onClick={() => window.print()}>⬇ PDF</button>
        <button className="pill" onClick={exportWord}>⬇ Word</button>
        <button className="pill" onClick={() => { void save({ ...doc, sections: [...sections, { heading: "New section", body: "Write here." }] }); }}>＋ Section</button>
      </div>
      <div id="doc-root" className={`${d.doc} doc-print-root`} data-kind={doc.kind} data-theme={doc.theme ?? "modern"} style={{ ["--doc-accent" as string]: accent }}>
        {doc.kind === "cv" ? (
          <div className={d.cv}>
            <aside className={d.cvSide}>
              <h1>{doc.title}</h1>{doc.subtitle && <p className={d.sub}>{doc.subtitle}</p>}
              {(doc.sidebar ?? []).map((b: A, i: number) => <div key={i}><h4>{b.heading}</h4><RichText text={b.body} /></div>)}
            </aside>
            <main>{sections.map(sectionEl)}</main>
          </div>
        ) : doc.kind === "slides" ? (
          <div className={d.slides}>{[{ heading: doc.title, body: doc.subtitle ?? "", cover: true }, ...sections].map((s: A, i: number) => <div key={i} className={d.slide} data-cover={s.cover ? "1" : undefined} onDoubleClick={() => i > 0 && setEdit(i - 1)}><h2>{s.heading}</h2><div className={d.slideBody}><RichText text={s.body ?? ""} />{s.figure?.url && <img src={s.figure.url} alt={s.figure.caption ?? ""} referrerPolicy="no-referrer" />}</div><span className={d.slideNo}>{i + 1}</span>{edit === i - 1 && i > 0 && <SectionEditor s={sections[i - 1]} onCancel={() => setEdit(null)} onSave={(ns) => { setEdit(null); void save({ ...doc, sections: sections.map((x, j) => (j === i - 1 ? ns : x)) }); }} onDelete={() => { setEdit(null); void save({ ...doc, sections: sections.filter((_, j) => j !== i - 1) }); }} />}</div>)}</div> // eslint-disable-line @next/next/no-img-element
        ) : (
          <>
            {doc.cover !== false && doc.kind !== "letter" && doc.kind !== "poster" && doc.kind !== "revision" && doc.kind !== "worksheet" ? (
              <div className={d.cover}><div className={d.coverBand} /><h1>{doc.title}</h1>{doc.subtitle && <p className={d.sub}>{doc.subtitle}</p>}<p className={d.meta}>{doc.author ?? "Reg"} · {doc.date}</p>{sections.find((s) => s.figure?.url)?.figure?.url && <img className={d.coverImg} src={sections.find((s) => s.figure?.url).figure.url} alt="" referrerPolicy="no-referrer" />}</div> // eslint-disable-line @next/next/no-img-element
            ) : <header className={d.head}><h1>{doc.title}</h1>{doc.subtitle && <p className={d.sub}>{doc.subtitle}</p>}{doc.kind !== "poster" && <p className={d.meta}>{doc.author ?? "Reg"} · {doc.date}</p>}</header>}
            {doc.contents && sections.filter((s) => s.heading && (s.level ?? 1) === 1).length > 2 && <nav className={d.toc}><h2>Contents</h2><ol>{sections.filter((s) => s.heading && (s.level ?? 1) === 1).map((s, i) => <li key={i}>{s.heading}</li>)}</ol></nav>}
            <div className={doc.kind === "poster" ? d.poster : doc.kind === "revision" ? d.revision : undefined}>{sections.map(sectionEl)}</div>
            {doc.references?.length > 0 && <section className={d.section}><h2>References</h2><ol className={d.refs}>{doc.references.map((r: string, i: number) => <li key={i}><RichText text={r} inline /></li>)}</ol></section>}
          </>
        )}
      </div>
      <div className={d.noPrint} style={{ maxWidth: 900, margin: "18px auto" }}>
        <span className="label">Ask Apollo to change it (&ldquo;add a section on…&rdquo;, &ldquo;make it more formal&rdquo;, &ldquo;use a picture of…&rdquo;, &ldquo;turn it into slides&rdquo;)</span>
        <RoomChat space={`doc:${id}`} conversationId={chat} onConversation={setChat} mode="chat" height={340}
          context={`Document ${id} open on screen (kind ${doc.kind}, "${doc.title}", ${sections.length} sections: ${sections.map((s, i) => `${i}:${s.heading ?? "(no heading)"}`).join("; ")}). Change it with update_document (document_id ${id}); find pictures with find_images.`}
          onSent={() => setTimeout(() => setTick((t) => t + 1), 20000)} />
      </div>
    </div>
  );
}

function SectionEditor({ s, onSave, onCancel, onDelete }: { s: A; onSave: (s: A) => void; onCancel: () => void; onDelete: () => void }) {
  const [x, setX] = useState<A>({ ...s });
  return (
    <div className={d.editor} onDoubleClick={(e) => e.stopPropagation()}>
      <input value={x.heading ?? ""} onChange={(e) => setX({ ...x, heading: e.target.value })} placeholder="Heading" />
      <textarea value={x.body ?? ""} onChange={(e) => setX({ ...x, body: e.target.value })} rows={10} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select value={x.layout ?? "text"} onChange={(e) => setX({ ...x, layout: e.target.value })}>{["text", "two-column", "figure-left", "figure-right", "callout"].map((l) => <option key={l}>{l}</option>)}</select>
        <input value={x.figure?.url ?? ""} onChange={(e) => setX({ ...x, figure: e.target.value ? { ...(x.figure ?? {}), url: e.target.value } : null })} placeholder="Image URL (optional)" style={{ flex: 1 }} />
        <input value={x.figure?.caption ?? ""} onChange={(e) => setX({ ...x, figure: { ...(x.figure ?? {}), caption: e.target.value } })} placeholder="Caption" />
        <label><input type="checkbox" checked={!!x.page_break} onChange={(e) => setX({ ...x, page_break: e.target.checked })} /> new page</label>
      </div>
      <div style={{ display: "flex", gap: 6 }}><button className="pill" data-active="true" onClick={() => onSave(x)}>Save</button><button className="pill" onClick={onCancel}>Cancel</button><button className="pill" onClick={onDelete}>Delete section</button></div>
    </div>
  );
}

function Presenter({ doc, i, setI, accent }: { doc: A; i: number; setI: (n: number | null) => void; accent: string }) {
  const slides = [{ heading: doc.title, body: doc.subtitle ?? "" }, ...(doc.sections ?? [])];
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (["ArrowRight", " ", "PageDown"].includes(e.key)) setI(Math.min(slides.length - 1, i + 1)); if (["ArrowLeft", "PageUp"].includes(e.key)) setI(Math.max(0, i - 1)); if (e.key === "Escape") setI(null); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [i, setI, slides.length]);
  const s = slides[i];
  return (
    <div onClick={() => setI(Math.min(slides.length - 1, i + 1))} style={{ position: "fixed", inset: 0, zIndex: 400, background: "#fff", color: "#111", display: "grid", gridTemplateRows: "auto 1fr auto", padding: "5vh 7vw", ["--doc-accent" as string]: accent }}>
      <h1 style={{ color: accent, fontSize: "clamp(28px, 4.5vw, 56px)", margin: 0 }}>{s.heading}</h1>
      <div style={{ fontSize: "clamp(18px, 2.2vw, 30px)", overflow: "hidden", display: "grid", gridTemplateColumns: s.figure?.url ? "1fr 1fr" : "1fr", gap: "3vw", alignItems: "center" }}>
        <RichText text={s.body ?? ""} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {s.figure?.url && <img src={s.figure.url} alt="" referrerPolicy="no-referrer" style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }} />}
      </div>
      <small style={{ opacity: 0.5 }}>{i + 1} / {slides.length} · ← → to move · Esc to exit</small>
    </div>
  );
}
