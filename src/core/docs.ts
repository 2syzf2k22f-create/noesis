// Documents Apollo makes (like real pieces of work): reports, school projects, CVs, essays, letters, posters,
// revision sheets and slide decks. Stored as a structured document (sections of Markdown + figures) in
// Library › Files and rendered by /doc/<id> with a proper print layout (cover, contents, numbered figures,
// references), so it saves as a clean PDF or Word file. Pictures and diagrams come from Wikimedia Commons
// and Openverse (openly licensed, credited automatically) or from Apollo's own diagrams and graphs.
import { nowIso, type Store } from "./store";

export const DOC_MIME = "application/vnd.noesis.doc+json";
export const DOC_KINDS = ["report", "project", "cv", "essay", "letter", "poster", "revision", "slides", "worksheet", "article"] as const;
export const DOC_THEMES = ["modern", "classic", "academic", "minimal", "bold"] as const;
export type Figure = { url?: string; query?: string; caption?: string; credit?: string; width?: "small" | "medium" | "full"; side?: "left" | "right" | "center" };
export type Section = { heading?: string; body?: string; figure?: Figure | null; layout?: "text" | "two-column" | "figure-left" | "figure-right" | "callout" | "sidebar"; level?: 1 | 2 | 3; page_break?: boolean };
export type Doc = {
  kind: string; title: string; subtitle?: string; author?: string; date?: string; theme?: string; accent?: string;
  cover?: boolean; contents?: boolean; numbered?: boolean;
  sections: Section[];
  sidebar?: { heading: string; body: string }[]; // CV sidebar: contact, skills, languages...
  references?: string[];
};

const UA = { "user-agent": "NOESIS-study-site/1.0 (personal school project helper)", accept: "application/json" };
/** Openly licensed pictures for a query: Wikimedia Commons first (diagrams, photos), then Openverse. */
export async function findImages(query: string, n = 6) {
  const out: { url: string; thumb: string; title: string; credit: string; license: string; source: string; width?: number; height?: number }[] = [];
  try {
    const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=${n * 2}&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap|drawing`)}&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=1000`;
    const j = await fetch(u, { headers: UA, signal: AbortSignal.timeout(9000) }).then((r) => r.json());
    for (const p of Object.values(j?.query?.pages ?? {}) as { title: string; imageinfo?: { thumburl?: string; url: string; width: number; height: number; extmetadata?: Record<string, { value: string }> }[] }[]) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const md = ii.extmetadata ?? {};
      const strip = (s?: string) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (/\.(pdf|tif|tiff|djvu|webm|ogv|ogg)$/i.test(p.title)) continue;
      out.push({ url: ii.thumburl ?? ii.url, thumb: ii.thumburl ?? ii.url, title: strip(md.ObjectName?.value) || p.title.replace(/^File:/, "").replace(/\.\w+$/, ""), credit: `${strip(md.Artist?.value) || "Wikimedia Commons"} (${strip(md.LicenseShortName?.value) || "see source"})`, license: strip(md.LicenseShortName?.value), source: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`, width: ii.width, height: ii.height });
      if (out.length >= n) break;
    }
  } catch { /* try the next source */ }
  if (out.length < n) try {
    const j = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${n}&mature=false`, { headers: UA, signal: AbortSignal.timeout(9000) }).then((r) => r.json());
    for (const r of j?.results ?? []) out.push({ url: r.url, thumb: r.thumbnail ?? r.url, title: r.title ?? query, credit: `${r.creator ?? "unknown"} (${String(r.license ?? "").toUpperCase()} ${r.license_version ?? ""})`.trim(), license: r.license, source: r.foreign_landing_url ?? r.url, width: r.width, height: r.height });
  } catch { /* none */ }
  return out.slice(0, n);
}

/** Fill in figures that only have a search query, and save/update the document. */
export async function saveDocument(store: Store, d: Doc, id?: string | null) {
  for (const s of d.sections) {
    const f = s.figure;
    if (f && !f.url && f.query) {
      const hit = (await findImages(f.query, 1))[0];
      if (hit) { f.url = hit.url; f.credit ??= hit.credit; f.caption ??= hit.title; } else s.figure = null;
    }
  }
  const body = JSON.stringify({ ...d, date: d.date ?? new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) });
  if (id) { await store.update("files", id, { name: `${d.title}.doc.json`, content: body, size_bytes: body.length, updated_at: nowIso() }); return { id }; }
  const row = await store.insert("files", { name: `${d.title}.doc.json`, mime: DOC_MIME, size_bytes: body.length, content: body, source: "apollo", folder: "Documents", tags: [d.kind] });
  return { id: row.id as string };
}
