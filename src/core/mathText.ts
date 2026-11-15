// Split text into plain text and LaTeX maths segments (see RichText).
type Seg = { t: "text" | "inline" | "display"; v: string };

/** Split a string into text and maths segments. */
export function splitMath(src: string): Seg[] {
  const out: Seg[] = [];
  let buf = "", i = 0;
  const push = (t: Seg["t"], v: string) => { if (buf) { out.push({ t: "text", v: buf }); buf = ""; } out.push({ t, v }); };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "\\" && n === "$") { buf += "$"; i += 2; continue; }
    if (c === "\\" && (n === "[" || n === "(")) {
      const close = n === "[" ? "\\]" : "\\)", j = src.indexOf(close, i + 2);
      if (j > i) { push(n === "[" ? "display" : "inline", src.slice(i + 2, j)); i = j + 2; continue; }
    }
    if (c === "$" && n === "$") {
      const j = src.indexOf("$$", i + 2);
      if (j > i + 2) { push("display", src.slice(i + 2, j)); i = j + 2; continue; }
    }
    if (c === "$" && n && !/\s/.test(n) && n !== "$") {
      // find a closing $ preceded by a non-space and not followed by a digit (so "$5 and $10" isn't maths)
      let j = i + 1;
      while ((j = src.indexOf("$", j + 1)) > 0) {
        if (src[j - 1] === "\\") continue;
        if (!/\s/.test(src[j - 1]) && !/\d/.test(src[j + 1] ?? "")) break;
      }
      if (j > 0 && !src.slice(i + 1, j).includes("\n\n")) { push("inline", src.slice(i + 1, j)); i = j + 1; continue; }
    }
    buf += c; i++;
  }
  if (buf) out.push({ t: "text", v: buf });
  return out;
}
export const hasMath = (s: string) => splitMath(s).some((x) => x.t !== "text");
