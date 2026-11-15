"use client";
// "fx" button with common LaTeX snippets (inserted at the cursor, cursor placed inside the first braces)
// and a live preview that appears under a text box once it contains maths.
import { useEffect, useState } from "react";
import { hasMath } from "@/core/mathText";
import { RichText } from "./RichText";

const SNIPPETS: [string, string][] = [
  ["a/b", "\\frac{}{}"], ["√", "\\sqrt{}"], ["ⁿ√", "\\sqrt[]{}"], ["xⁿ", "^{}"], ["xₙ", "_{}"], ["Σ", "\\sum_{}^{}"], ["∫", "\\int_{}^{}"], ["lim", "\\lim_{x \\to }"],
  ["vec", "\\vec{}"], ["matrix", "\\begin{pmatrix}  &  \\\\  &  \\end{pmatrix}"], ["( )", "\\left(  \\right)"], ["|x|", "\\left|  \\right|"],
  ["α", "\\alpha"], ["β", "\\beta"], ["γ", "\\gamma"], ["δ", "\\delta"], ["θ", "\\theta"], ["λ", "\\lambda"], ["μ", "\\mu"], ["π", "\\pi"], ["σ", "\\sigma"], ["ω", "\\omega"], ["Δ", "\\Delta"], ["Ω", "\\Omega"],
  ["±", "\\pm"], ["≠", "\\neq"], ["≤", "\\leq"], ["≥", "\\geq"], ["≈", "\\approx"], ["∞", "\\infty"], ["°", "^{\\circ}"], ["×", "\\times"], ["÷", "\\div"],
  ["→", "\\rightarrow"], ["⇒", "\\Rightarrow"], ["⇔", "\\Leftrightarrow"], ["∈", "\\in"], ["ℝ", "\\mathbb{R}"], ["dy/dx", "\\frac{dy}{dx}"], ["ce", "\\ce{}"],
];

/** Insert `snippet` into a textarea/input at the cursor (wrapped in $…$ unless already inside maths). */
export function insertAt(el: HTMLTextAreaElement | HTMLInputElement | null, value: string, snippet: string, set: (v: string) => void) {
  const start = el?.selectionStart ?? value.length, end = el?.selectionEnd ?? value.length;
  const before = value.slice(0, start), after = value.slice(end);
  const inMath = (before.match(/(?<!\\)\$/g) ?? []).length % 2 === 1;
  const text = inMath ? snippet : `$${snippet}$`;
  const brace = text.indexOf("{}"), caret = brace >= 0 ? brace + 1 : text.length - (inMath ? 0 : 1);
  set(before + text + after);
  requestAnimationFrame(() => { if (!el) return; el.focus(); const p = start + caret; el.setSelectionRange(p, p); });
}

export function FxButton({ target, value, set, compact }: { target: () => HTMLTextAreaElement | HTMLInputElement | null; value: string; set: (v: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className="pill" onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)} title="Insert a formula" style={compact ? { padding: "0 7px", height: 26, fontStyle: "italic" } : { fontStyle: "italic" }}>fx</button>
      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", right: 0, zIndex: 60, width: 300, maxHeight: 260, overflow: "auto", padding: 8, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", boxShadow: "0 12px 30px rgba(0,0,0,.4)", display: "flex", flexWrap: "wrap", gap: 4 }}>
          {SNIPPETS.map(([label, tex]) => (
            <button key={label} type="button" className="pill" onMouseDown={(e) => e.preventDefault()} onClick={() => { insertAt(target(), value, tex, set); setOpen(false); }} title={tex} style={{ padding: "0 7px", height: 26 }}>{label}</button>
          ))}
          <small className="label" style={{ width: "100%" }}>Inline: $x^2$ · on its own line: $$x^2$$</small>
        </div>
      )}
    </span>
  );
}

/** Rendered preview, shown only when the text contains maths. */
export function MathPreview({ value }: { value: string }) {
  if (!value || !hasMath(value)) return null;
  return <div style={{ padding: "6px 10px", borderRadius: 8, background: "var(--surface-2)", fontSize: 13, maxHeight: 160, overflow: "auto" }} aria-label="Preview"><RichText text={value} /></div>;
}

/** A form textarea with the fx button and live maths preview (uncontrolled for the form: keeps its name). */
export function MathArea({ name, rows = 3, required, placeholder }: { name: string; rows?: number; required?: boolean; placeholder?: string }) {
  const [v, setV] = useState("");
  const [el, setEl] = useState<HTMLTextAreaElement | null>(null);
  // forms clear themselves after saving: follow along
  useEffect(() => { const f = el?.form; if (!f) return; const r = () => setV(""); f.addEventListener("reset", r); return () => f.removeEventListener("reset", r); }, [el]);
  return (
    <span style={{ display: "grid", gap: 4 }}>
      <span style={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
        <textarea ref={setEl} name={name} rows={rows} required={required} placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} style={{ flex: 1 }} />
        <FxButton target={() => el} value={v} set={setV} compact />
      </span>
      <MathPreview value={v} />
    </span>
  );
}
