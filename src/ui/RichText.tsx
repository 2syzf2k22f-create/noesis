"use client";
// Rich text for everything Apollo (or Reg) writes, everywhere on the site:
//  - Markdown: # headings, **bold**, *italic*, ~~strike~~, `code`, [links](url), bare URLs, ![images](url),
//    "- " / "1. " lists (nested by indent), - [ ] task lists, > quotes, | tables |, --- rules.
//  - LaTeX maths by KaTeX: $inline$, \( \), $$display$$, \[ \], chemistry with \ce{...}. KaTeX loads on demand.
//  - Fenced blocks with a language become live displays:
//      ```mermaid   flowcharts, mind maps, sequence/state diagrams, timelines
//      ```chart     {"type":"line|bar|scatter|pie","labels":[...],"series":[{"name":"","data":[...]}],"x":"","y":""}
//      ```plot      y = x^2 - 3 \n y = sin(x) \n x: -5..5        (function graphs)
//      ```svg       a drawing / diagram Apollo draws itself
//      ```html      an interactive demo or simulation (sandboxed: no access to the site)
//      ```quiz      [{"q":"","options":["",""],"answer":0,"explain":""}]
//      ```steps     a worked example revealed one step at a time
//      any other    code with a copy button
// "$5 and $10" stays text. Unfinished formulas/blocks (while Apollo is still typing) stay plain until closed.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import u from "./ui.module.css";
import { splitMath } from "@/core/mathText";
export { hasMath, splitMath } from "@/core/mathText";

/* ---------------- KaTeX, loaded only when there's maths ---------------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let katex: any = null;
let katexP: Promise<void> | null = null;
const katexListeners = new Set<() => void>();
function loadKatex() {
  katexP ??= Promise.all([import("katex"), import("katex/contrib/mhchem" as string)]).then(([k]) => {
    katex = k.default; katexListeners.forEach((f) => f());
    void import("katex/contrib/copy-tex" as string); // copying a formula copies its LaTeX
  });
  return katexP;
}
function useKatex(needed: boolean) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!needed || katex) return;
    const f = () => set((n) => n + 1);
    katexListeners.add(f); void loadKatex();
    return () => { katexListeners.delete(f); };
  }, [needed]);
}
const cache = new Map<string, string>();
function tex(src: string, display: boolean) {
  const k = `${display ? "D" : "I"}${src}`;
  let html = cache.get(k);
  if (html == null) {
    html = katex.renderToString(src, { displayMode: display, throwOnError: false, errorColor: "#c97070", trust: false, output: "htmlAndMathml", strict: "ignore" }) as string;
    if (cache.size > 2000) cache.clear();
    cache.set(k, html);
  }
  return html;
}
function Math_({ src, display }: { src: string; display: boolean }) {
  if (!katex) return display ? <div className={u.mathBlock} style={{ opacity: 0.6 }}>{src}</div> : <span style={{ opacity: 0.7 }}>{src}</span>;
  return display
    ? <div className={u.mathBlock} dangerouslySetInnerHTML={{ __html: tex(src, true) }} />
    : <span className={u.mathInline} dangerouslySetInnerHTML={{ __html: tex(src, false) }} />;
}

/* ---------------- inline Markdown ---------------- */
const safeUrl = (h: string) => (/^(https?:|mailto:|\/)/i.test(h) ? h : "#");
function inlineMd(s: string, key: string): React.ReactNode[] {
  const re = /(!\[[^\]]*\]\([^)\s]+\)|\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*\s][^*]*\*|`[^`]+`|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  return s.split(re).map((t, i) => {
    const k = `${key}${i}`;
    if (!t) return null;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line @next/next/no-img-element
    if ((m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t))) return <img key={k} src={safeUrl(m[2])} alt={m[1]} title={m[1]} style={{ maxWidth: "100%", borderRadius: 8, display: "block", margin: "6px 0" }} loading="lazy" referrerPolicy="no-referrer" />;
    if ((m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t))) return <a key={k} href={safeUrl(m[2])} target="_blank" rel="noreferrer">{m[1]}</a>;
    if (/^https?:\/\//.test(t)) return <a key={k} href={t} target="_blank" rel="noreferrer">{t.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60)}</a>;
    if ((t.startsWith("**") || t.startsWith("__")) && t.length > 4) return <b key={k}>{t.slice(2, -2)}</b>;
    if (t.startsWith("~~") && t.length > 4) return <s key={k}>{t.slice(2, -2)}</s>;
    if (t.startsWith("`") && t.length > 2) return <code key={k}>{t.slice(1, -1)}</code>;
    if (t.startsWith("*") && t.length > 2) return <em key={k}>{t.slice(1, -1)}</em>;
    return <Fragment key={k}>{t}</Fragment>;
  });
}
function line(s: string, key: string) {
  return splitMath(s).map((seg, i) => seg.t === "text" ? <Fragment key={`${key}-${i}`}>{inlineMd(seg.v, `${key}-${i}-`)}</Fragment> : <Math_ key={`${key}-${i}`} src={seg.v} display={seg.t === "display"} />);
}

/* ---------------- block Markdown ---------------- */
type Seg = { t: "text" | "display"; v: string } | { t: "fence"; lang: string; v: string };
function segments(src: string): Seg[] {
  const out: Seg[] = [];
  // fenced blocks first (their contents are never parsed as Markdown or maths); an unclosed fence stays text
  const re = /(^|\n)```([\w+-]*)[^\n]*\n([\s\S]*?)\n```(?=\n|$)/g;
  let last = 0, m: RegExpExecArray | null;
  const text = (v: string) => {
    for (const seg of splitMath(v)) {
      if (seg.t === "display") out.push({ t: "display", v: seg.v });
      else {
        const vv = seg.t === "inline" ? `\\(${seg.v}\\)` : seg.v.replace(/\$/g, "\\$");
        const l = out[out.length - 1];
        if (l?.t === "text") l.v += vv; else out.push({ t: "text", v: vv });
      }
    }
  };
  while ((m = re.exec(src))) { text(src.slice(last, m.index + m[1].length)); out.push({ t: "fence", lang: m[2].toLowerCase(), v: m[3] }); last = re.lastIndex; }
  text(src.slice(last));
  return out;
}
const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
function blocks(text: string, key: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0, n = 0;
  const k = () => `${key}-${n++}`;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { const H = (`h${Math.min(6, m[1].length + 2)}`) as "h3"; out.push(<H key={k()} className={u.mdH}>{line(m[2], k())}</H>); i++; continue; }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { out.push(<hr key={k()} />); i++; continue; }
    if (/^\s*>/.test(l)) { const q: string[] = []; while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(<blockquote key={k()} className={u.mdQuote}>{blocks(q.join("\n"), k())}</blockquote>); continue; }
    if (isTableRow(l) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      const cells = (r: string) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(l), align = cells(lines[i + 1]).map((c) => (c.endsWith(":") ? (c.startsWith(":") ? "center" : "right") : "left") as "left");
      i += 2; const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(<div key={k()} className={u.mdTableWrap}><table className={u.mdTable}><thead><tr>{head.map((h, j) => <th key={j} style={{ textAlign: align[j] }}>{line(h, `${key}h${j}`)}</th>)}</tr></thead><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, j) => <td key={j} style={{ textAlign: align[j] }}>{line(c, `${key}r${ri}c${j}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*([-•*+]|\d+[.)])\s/.test(l)) {
      const items: { indent: number; ordered: boolean; text: string }[] = [];
      while (i < lines.length && (/^\s*([-•*+]|\d+[.)])\s/.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const mm = /^(\s*)([-•*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (mm) items.push({ indent: mm[1].length, ordered: /\d/.test(mm[2]), text: mm[3] }); else items[items.length - 1].text += " " + lines[i].trim();
        i++;
      }
      out.push(<Fragment key={k()}>{listTree(items, 0, k())}</Fragment>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*>|\s*([-•*+]|\d+[.)])\s|\s*(-{3,}|\*{3,})\s*$)/.test(lines[i]) && !(isTableRow(lines[i]) && isTableRow(lines[i + 1] ?? ""))) para.push(lines[i++]);
    if (para.length) out.push(<p key={k()} style={{ whiteSpace: "pre-line" }}>{line(para.join("\n"), k())}</p>);
    else i++;
  }
  return out;
}
function listTree(items: { indent: number; ordered: boolean; text: string }[], from: number, key: string): React.ReactNode {
  const base = items[from]?.indent ?? 0;
  const els: React.ReactNode[] = [];
  let j = from;
  while (j < items.length && items[j].indent >= base) {
    const it = items[j];
    if (it.indent > base) { j++; continue; }
    const kids: number[] = [];
    let q = j + 1; while (q < items.length && items[q].indent > base) { kids.push(q); q++; }
    const task = /^\[( |x|X)\]\s+/.exec(it.text);
    els.push(<li key={j} style={task ? { listStyle: "none", marginLeft: -18 } : undefined}>{task ? <><input type="checkbox" readOnly checked={task[1] !== " "} style={{ marginRight: 6 }} />{line(it.text.slice(task[0].length), `${key}${j}`)}</> : line(it.text, `${key}${j}`)}{kids.length ? listTree(items, kids[0], `${key}${j}k`) : null}</li>);
    j = q;
  }
  return items[from]?.ordered ? <ol key={key}>{els}</ol> : <ul key={key}>{els}</ul>;
}

/* ---------------- live fenced blocks ---------------- */
function Fence({ lang, code }: { lang: string; code: string }) {
  if (lang === "mermaid") return <Mermaid code={code} />;
  if (lang === "chart") return <Chart code={code} />;
  if (lang === "plot" || lang === "graph") return <Plot code={code} />;
  if (lang === "svg") return <div className={u.mdFigure}><img alt="diagram" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(code.trim())}`} style={{ maxWidth: "100%" }} /></div>; // eslint-disable-line @next/next/no-img-element
  if (lang === "html" || lang === "sim" || lang === "demo") return <Sandbox code={code} />;
  if (lang === "quiz") return <Quiz code={code} />;
  if (lang === "steps") return <Steps code={code} />;
  return <CodeBlock lang={lang} code={code} />;
}
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={u.mdCode}>
      <div className={u.mdCodeBar}><span>{lang || "text"}</span><button onClick={() => { void navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "Copied" : "Copy"}</button></div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
// mermaid from the CDN, once
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mermaidP: Promise<any> | null = null;
let mermaidN = 0;
function Mermaid({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    mermaidP ??= import(/* webpackIgnore: true */ "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs" as string).then((m) => {
      const dark = matchMedia("(prefers-color-scheme: dark)").matches || document.documentElement.dataset.theme !== "light";
      m.default.initialize({ startOnLoad: false, theme: dark ? "dark" : "default", securityLevel: "strict", fontFamily: "inherit" });
      return m.default;
    });
    mermaidP.then((mm) => mm.render(`mmd${++mermaidN}`, code.trim())).then((r: { svg: string }) => { if (live) setSvg(r.svg); }).catch((e: Error) => { if (live) setErr(e.message?.split("\n")[0] ?? "diagram error"); });
    return () => { live = false; };
  }, [code]);
  if (err) return <CodeBlock lang="mermaid" code={code} />;
  if (!svg) return <div className="label">Drawing diagram…</div>;
  return <div className={u.mdFigure} dangerouslySetInnerHTML={{ __html: svg }} />;
}
const PALETTE = ["#3ee0ff", "#f5a524", "#30a46c", "#e5484d", "#9b8cff", "#ff8fd0", "#8fd14f"];
type ChartSpec = { type?: string; title?: string; labels?: (string | number)[]; series?: { name?: string; data: (number | [number, number])[] }[]; x?: string; y?: string };
function Chart({ code }: { code: string }) {
  let c: ChartSpec;
  try { c = JSON.parse(code); } catch { return <CodeBlock lang="chart" code={code} />; }
  const series = c.series ?? [];
  const W = 560, H = 280, P = 40;
  if (c.type === "pie") {
    const d = (series[0]?.data ?? []) as number[]; const tot = d.reduce((a, b) => a + b, 0) || 1;
    const angles = d.map((_, i) => -Math.PI / 2 + (d.slice(0, i).reduce((x, y) => x + y, 0) / tot) * 2 * Math.PI);
    return (
      <figure className={u.mdFigure}>
        {c.title && <figcaption>{c.title}</figcaption>}
        <svg viewBox="0 0 560 240" style={{ width: "100%", maxWidth: 560 }}>
          {d.map((v, i) => { const a0 = angles[i], a1 = a0 + (v / tot) * 2 * Math.PI; const big = a1 - a0 > Math.PI ? 1 : 0; const p = `M120,120 L${120 + 100 * Math.cos(a0)},${120 + 100 * Math.sin(a0)} A100,100 0 ${big} 1 ${120 + 100 * Math.cos(a1)},${120 + 100 * Math.sin(a1)} Z`; return <path key={i} d={p} fill={PALETTE[i % PALETTE.length]} stroke="var(--bg)" />; })}
          {d.map((v, i) => <g key={i}><rect x={260} y={20 + i * 22} width={12} height={12} fill={PALETTE[i % PALETTE.length]} /><text x={280} y={31 + i * 22} fontSize={12} fill="currentColor">{String(c.labels?.[i] ?? i)}: {v} ({Math.round((v / tot) * 100)}%)</text></g>)}
        </svg>
      </figure>
    );
  }
  const pts = series.map((s) => s.data.map((v, i) => (Array.isArray(v) ? v : [i, v]) as [number, number]));
  const xs = pts.flat().map((p) => p[0]), ys = pts.flat().map((p) => p[1]);
  if (!xs.length) return <CodeBlock lang="chart" code={code} />;
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys) || 1;
  const sx = (x: number) => P + ((x - x0) / (x1 - x0 || 1)) * (W - 2 * P), sy = (y: number) => H - P - ((y - y0) / (y1 - y0 || 1)) * (H - 2 * P);
  // bars: one band per category, series side by side inside it
  const nCat = Math.max(1, c.labels?.length ?? Math.max(...series.map((x) => x.data.length))), band = (W - 2 * P) / nCat, bw = (band * 0.75) / Math.max(1, series.length);
  const bx = (i: number, si: number) => P + i * band + band * 0.125 + si * bw;
  return (
    <figure className={u.mdFigure}>
      {c.title && <figcaption>{c.title}</figcaption>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W }}>
        <line x1={P} y1={sy(y0)} x2={W - P} y2={sy(y0)} stroke="currentColor" opacity={0.4} />
        <line x1={P} y1={P / 2} x2={P} y2={H - P} stroke="currentColor" opacity={0.4} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const v = y0 + f * (y1 - y0); return <text key={f} x={P - 6} y={sy(v) + 4} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.7}>{+v.toPrecision(3)}</text>; })}
        {(c.labels ?? []).map((l, i) => <text key={i} x={c.type === "bar" ? P + i * band + band / 2 : sx(i)} y={H - P + 14} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.7}>{String(l)}</text>)}
        {pts.map((ps, si) => c.type === "bar"
          ? ps.map(([, y], i) => <rect key={`${si}-${i}`} x={bx(i, si)} y={Math.min(sy(y), sy(0))} width={bw * 0.92} height={Math.abs(sy(y) - sy(0))} fill={PALETTE[si % PALETTE.length]} rx={2} />)
          : c.type === "scatter" ? ps.map(([x, y], i) => <circle key={`${si}-${i}`} cx={sx(x)} cy={sy(y)} r={3.5} fill={PALETTE[si % PALETTE.length]} />)
            : <polyline key={si} fill="none" stroke={PALETTE[si % PALETTE.length]} strokeWidth={2} points={ps.map(([x, y]) => `${sx(x)},${sy(y)}`).join(" ")} />)}
        {series.length > 1 && series.map((s, si) => <text key={si} x={W - P} y={14 + si * 14} fontSize={11} textAnchor="end" fill={PALETTE[si % PALETTE.length]}>{s.name ?? `series ${si + 1}`}</text>)}
        {c.x && <text x={W / 2} y={H - 4} fontSize={11} textAnchor="middle" fill="currentColor">{c.x}</text>}
        {c.y && <text x={12} y={H / 2} fontSize={11} textAnchor="middle" fill="currentColor" transform={`rotate(-90 12 ${H / 2})`}>{c.y}</text>}
      </svg>
    </figure>
  );
}
/** Safe expression -> function of x (only numbers, x, operators and Math functions). */
export function compileFn(expr: string): ((x: number) => number) | null {
  const e = expr.replace(/^\s*(y|f\(x\))\s*=\s*/i, "").replace(/\^/g, "**").replace(/(\d)\s*(x|\()/g, "$1*$2").replace(/\)\s*(x|\d|\()/g, ")*$1").replace(/x\s*\(/g, "x*(");
  if (!/^[\d\s+\-*/().,x*a-z]*$/i.test(e)) return null;
  const words = e.match(/[a-z]+/gi) ?? [];
  const ok = new Set(["x", "sin", "cos", "tan", "asin", "acos", "atan", "sinh", "cosh", "tanh", "sqrt", "abs", "log", "ln", "exp", "pi", "e", "floor", "ceil", "sec", "csc", "cot"]);
  if (words.some((w) => !ok.has(w.toLowerCase()))) return null;
  try {
    const body = e.replace(/\bln\b/g, "log").replace(/\bpi\b/gi, "PI").replace(/\be\b/g, "E").replace(/\bsec\b/g, "1/cos").replace(/\bcsc\b/g, "1/sin").replace(/\bcot\b/g, "1/tan");
    // eslint-disable-next-line no-new-func
    const f = new Function("x", `with (Math) { return (${body}); }`) as (x: number) => number;
    f(1); return f;
  } catch { return null; }
}
function Plot({ code }: { code: string }) {
  const lines = code.split("\n").map((l) => l.trim()).filter(Boolean);
  const rx = /^x\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)/i.exec(lines.find((l) => /^x\s*:/i.test(l)) ?? "");
  const ry = /^y\s*:\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)/i.exec(lines.find((l) => /^y\s*:/i.test(l)) ?? "");
  const fns = lines.filter((l) => !/^[xy]\s*:/i.test(l)).map((l) => ({ label: l, f: compileFn(l) })).filter((x) => x.f);
  if (!fns.length) return <CodeBlock lang="plot" code={code} />;
  const X0 = rx ? +rx[1] : -6, X1 = rx ? +rx[2] : 6, W = 560, H = 320, N = 400;
  const samples = fns.map(({ f }) => Array.from({ length: N + 1 }, (_, i) => { const x = X0 + ((X1 - X0) * i) / N; const y = f!(x); return [x, Number.isFinite(y) ? y : NaN] as [number, number]; }));
  const ys = samples.flat().map((p) => p[1]).filter(Number.isFinite).sort((a, b) => a - b);
  const Y0 = ry ? +ry[1] : Math.max(ys[Math.floor(ys.length * 0.02)] ?? -6, -50), Y1 = ry ? +ry[2] : Math.min(ys[Math.floor(ys.length * 0.98)] ?? 6, 50);
  const sx = (x: number) => ((x - X0) / (X1 - X0)) * W, sy = (y: number) => H - ((y - Y0) / (Y1 - Y0 || 1)) * H;
  const path = (ps: [number, number][]) => { let d = "", pen = false; for (const [x, y] of ps) { if (!Number.isFinite(y) || y < Y0 - (Y1 - Y0) || y > Y1 + (Y1 - Y0)) { pen = false; continue; } d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`; pen = true; } return d; };
  const step = (a: number, b: number) => { const r = (b - a) / 8; const p = 10 ** Math.floor(Math.log10(r)); return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= r) ?? r; };
  const gx = step(X0, X1), gy = step(Y0, Y1);
  return (
    <figure className={u.mdFigure}>
      <svg viewBox={`-30 -10 ${W + 40} ${H + 30}`} style={{ width: "100%", maxWidth: W }}>
        {Array.from({ length: Math.floor((X1 - X0) / gx) + 1 }, (_, i) => Math.ceil(X0 / gx) * gx + i * gx).map((x) => <g key={`x${x}`}><line x1={sx(x)} x2={sx(x)} y1={0} y2={H} stroke="currentColor" opacity={0.08} /><text x={sx(x)} y={Math.min(H + 14, Math.max(12, sy(0) + 14))} fontSize={10} textAnchor="middle" fill="currentColor" opacity={0.6}>{+x.toFixed(4)}</text></g>)}
        {Array.from({ length: Math.floor((Y1 - Y0) / gy) + 1 }, (_, i) => Math.ceil(Y0 / gy) * gy + i * gy).map((y) => <g key={`y${y}`}><line y1={sy(y)} y2={sy(y)} x1={0} x2={W} stroke="currentColor" opacity={0.08} /><text x={Math.min(W - 4, Math.max(-4, sx(0) - 4))} y={sy(y) + 3} fontSize={10} textAnchor="end" fill="currentColor" opacity={0.6}>{+y.toFixed(4)}</text></g>)}
        {X0 < 0 && X1 > 0 && <line x1={sx(0)} x2={sx(0)} y1={0} y2={H} stroke="currentColor" opacity={0.5} />}
        {Y0 < 0 && Y1 > 0 && <line y1={sy(0)} y2={sy(0)} x1={0} x2={W} stroke="currentColor" opacity={0.5} />}
        {samples.map((s, i) => <path key={i} d={path(s)} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={2.2} />)}
      </svg>
      <figcaption>{fns.map((f, i) => <span key={i} style={{ color: PALETTE[i % PALETTE.length], marginRight: 12 }}>{f.label}</span>)}</figcaption>
    </figure>
  );
}
/** Interactive HTML (simulations, demos) in a sealed iframe: scripts run, but it can't see the site, cookies or data. */
function Sandbox({ code }: { code: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [h, setH] = useState(320);
  useEffect(() => {
    const f = (e: MessageEvent) => { if (e.source === ref.current?.contentWindow && typeof e.data?.noesisHeight === "number") setH(Math.min(900, Math.max(120, e.data.noesisHeight + 16))); };
    window.addEventListener("message", f); return () => window.removeEventListener("message", f);
  }, []);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:8px;font:14px system-ui;color:#e8ecff;background:#0d1328}canvas,svg{max-width:100%}</style></head><body>${code}<script>new ResizeObserver(()=>parent.postMessage({noesisHeight:document.documentElement.scrollHeight},"*")).observe(document.documentElement)</script></body></html>`;
  return <iframe ref={ref} title="Interactive demo" sandbox="allow-scripts" srcDoc={doc} style={{ width: "100%", height: h, border: "1px solid var(--border)", borderRadius: 10, background: "#0d1328" }} />;
}
function Quiz({ code }: { code: string }) {
  let qs: { q: string; options?: string[]; answer?: number | string; explain?: string }[];
  try { const j = JSON.parse(code); qs = Array.isArray(j) ? j : j.questions ?? [j]; } catch { return <CodeBlock lang="quiz" code={code} />; }
  return <div style={{ display: "grid", gap: 10 }}>{qs.map((q, i) => <QuizQ key={i} n={i + 1} q={q} />)}</div>;
}
function QuizQ({ n, q }: { n: number; q: { q: string; options?: string[]; answer?: number | string; explain?: string } }) {
  const [pick, setPick] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const right = typeof q.answer === "number" ? q.answer : q.options?.findIndex((o) => o === q.answer) ?? -1;
  return (
    <div className={u.mdQuiz}>
      <div><b>{n}.</b> <RichText text={q.q} inline /></div>
      {q.options?.length ? (
        <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
          {q.options.map((o, i) => <button key={i} className="pill" disabled={pick != null} onClick={() => setPick(i)} style={{ justifyContent: "flex-start", height: "auto", minHeight: 30, padding: "4px 12px", borderColor: pick != null && i === right ? "var(--good)" : pick === i ? "var(--danger)" : undefined }}><RichText text={o} inline /></button>)}
        </div>
      ) : <button className="pill" style={{ marginTop: 6 }} onClick={() => setShown(true)}>Show answer</button>}
      {(pick != null || shown) && <div style={{ marginTop: 6, fontSize: 13 }}>{pick != null && (pick === right ? <b style={{ color: "var(--good)" }}>✓ Right. </b> : <b style={{ color: "var(--danger)" }}>✗ </b>)}{!q.options?.length && q.answer != null && <RichText text={String(q.answer)} inline />} {q.explain && <RichText text={q.explain} inline />}</div>}
    </div>
  );
}
function Steps({ code }: { code: string }) {
  const steps = code.split(/\n(?=\s*(?:\d+[.)]|step\s*\d+[:.)]?)\s)/i).map((s) => s.trim()).filter(Boolean);
  const [n, setN] = useState(1);
  return (
    <div className={u.mdQuiz}>
      <span className="label">Worked example · step {Math.min(n, steps.length)} of {steps.length}</span>
      {steps.slice(0, n).map((s, i) => <div key={i} style={{ marginTop: 6 }}><RichText text={s} /></div>)}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        {n < steps.length && <button className="pill" data-active="true" onClick={() => setN(n + 1)}>Next step</button>}
        {n < steps.length && <button className="pill" onClick={() => setN(steps.length)}>Show all</button>}
        {n > 1 && <button className="pill" onClick={() => setN(1)}>Hide again</button>}
      </div>
    </div>
  );
}

/* ---------------- the component ---------------- */
export function RichText({ text, className, inline: isInline }: { text: string | null | undefined; className?: string; inline?: boolean }) {
  const src = String(text ?? "");
  const segs = useMemo(() => (isInline ? null : segments(src)), [src, isInline]);
  const needsTex = useMemo(() => /\$|\\\(|\\\[|\\ce\{/.test(src) && splitMath(src).some((s) => s.t !== "text"), [src]);
  useKatex(needsTex);
  const body = useMemo((): React.ReactNode[] => {
    if (isInline) return line(src.replace(/\n+/g, " "), "l");
    return segs!.flatMap((seg, si): React.ReactNode[] => seg.t === "display" ? [<Math_ key={`d${si}`} src={seg.v} display />] : seg.t === "fence" ? [<Fence key={`f${si}`} lang={seg.lang} code={seg.v} />] : blocks(seg.v, `b${si}`));
    // katex arriving re-renders (useKatex bumps state); the memo must recompute then too
  }, [src, isInline, segs, needsTex && !!katex]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isInline) return <span className={className}>{body}</span>;
  return <div className={`${u.md} ${className ?? ""}`}>{body}</div>;
}
