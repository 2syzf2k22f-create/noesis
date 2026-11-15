"use client";
// Text with Markdown (paragraphs, "- " lists, **bold**, *italic*, `code`) and LaTeX maths rendered by KaTeX.
//   inline:  $x^2$  or  \( x^2 \)        display: $$ ... $$  or  \[ ... \]
// "$5 and $10" stays text: an opening $ must be followed by a non-space, a closing $ preceded by a
// non-space and not followed by a digit. \$ is a literal dollar. An unclosed formula (e.g. while Apollo is
// still typing) stays plain text until it closes. Bad LaTeX shows as muted red source, never a crash.
import katex from "katex";
import "katex/contrib/mhchem";
import { Fragment, useEffect, useMemo } from "react";
import u from "./ui.module.css";

import { splitMath } from "@/core/mathText";
export { hasMath, splitMath } from "@/core/mathText";

const cache = new Map<string, string>();
function tex(src: string, display: boolean) {
  const k = `${display ? "D" : "I"}${src}`;
  let html = cache.get(k);
  if (html == null) {
    html = katex.renderToString(src, { displayMode: display, throwOnError: false, errorColor: "#c97070", trust: false, output: "htmlAndMathml", strict: "ignore" });
    if (cache.size > 2000) cache.clear();
    cache.set(k, html);
  }
  return html;
}
function Math_({ src, display }: { src: string; display: boolean }) {
  return display
    ? <div className={u.mathBlock} dangerouslySetInnerHTML={{ __html: tex(src, true) }} />
    : <span className={u.mathInline} dangerouslySetInnerHTML={{ __html: tex(src, false) }} />;
}

/** Markdown emphasis inside a text run. */
function inlineMd(s: string, key: string) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g).map((t, i) =>
    t.startsWith("**") && t.length > 4 ? <b key={`${key}${i}`}>{t.slice(2, -2)}</b>
      : t.startsWith("`") && t.length > 2 ? <code key={`${key}${i}`}>{t.slice(1, -1)}</code>
        : t.startsWith("*") && t.length > 2 ? <em key={`${key}${i}`}>{t.slice(1, -1)}</em>
          : <Fragment key={`${key}${i}`}>{t}</Fragment>);
}
/** A line: text runs with Markdown + inline maths. */
function line(s: string, key: string) {
  return splitMath(s).map((seg, i) => seg.t === "text" ? <Fragment key={`${key}-${i}`}>{inlineMd(seg.v, `${key}-${i}-`)}</Fragment> : <Math_ key={`${key}-${i}`} src={seg.v} display={seg.t === "display"} />);
}

/** Load copy-tex once in the browser: copying a rendered formula copies its LaTeX. */
let copyTex = false;
function useCopyTex() { useEffect(() => { if (!copyTex) { copyTex = true; void import("katex/contrib/copy-tex"); } }, []); }

/** Full rich text: paragraphs, lists, line breaks, display + inline maths. */
export function RichText({ text, className, inline: isInline }: { text: string | null | undefined; className?: string; inline?: boolean }) {
  useCopyTex();
  const src = String(text ?? "");
  const body = useMemo(() => {
    if (isInline) return line(src.replace(/\n+/g, " "), "l");
    // display maths may span lines and paragraphs: split only that out first, keeping inline maths in its sentence
    const chunks: { t: "text" | "display"; v: string }[] = [];
    for (const seg of splitMath(src)) {
      if (seg.t === "display") chunks.push({ t: "display", v: seg.v });
      else {
        const v = seg.t === "inline" ? `\\(${seg.v}\\)` : seg.v.replace(/\$/g, "\\$");
        const last = chunks[chunks.length - 1];
        if (last?.t === "text") last.v += v; else chunks.push({ t: "text", v });
      }
    }
    return chunks.flatMap((seg, si) => {
      if (seg.t === "display") return [<Math_ key={`d${si}`} src={seg.v} display />];
      return seg.v.split(/\n{2,}/).map((para, pi) => {
        const key = `p${si}-${pi}`;
        if (!para.trim()) return null;
        const lines = para.split("\n");
        if (lines.every((l) => /^\s*([-•*]|\d+[.)])\s/.test(l) || !l.trim())) {
          const ordered = /^\s*\d+[.)]\s/.test(lines[0]);
          const items = lines.filter((l) => l.trim()).map((l, k) => <li key={k}>{line(l.replace(/^\s*([-•*]|\d+[.)])\s/, ""), `${key}-${k}`)}</li>);
          return ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        return <p key={key} style={{ whiteSpace: "pre-line" }}>{line(para, key)}</p>;
      });
    });
  }, [src, isInline]);
  if (isInline) return <span className={className}>{body}</span>;
  return <div className={`${u.md} ${className ?? ""}`}>{body}</div>;
}
