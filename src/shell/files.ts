"use client";
// Read attached files in the browser: PDF (pdf.js), DOCX (unzipped XML), CSV/TXT/MD/JSON (text).
// Images are shrunk and sent as pictures. Text is capped so a huge file can't blow up a message.

import { shrinkImage } from "./images";

export type Attached = { name: string; kind: "pdf" | "docx" | "csv" | "text" | "image"; text?: string; image?: string; size: number; note?: string };
export const MAX_FILE_MB = 15;
const MAX_CHARS = 60_000;
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
export const ACCEPT = "image/*,.pdf,.docx,.csv,.tsv,.txt,.md,.json";

export async function pdfText(file: Blob) {
  const pdfjs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ PDFJS);
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS.replace("pdf.min.mjs", "pdf.worker.min.mjs");
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 300); i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    pages.push(`[page ${i}]\n${c.items.map((x: { str?: string; hasEOL?: boolean }) => (x.str ?? "") + (x.hasEOL ? "\n" : " ")).join("")}`);
  }
  return pages.join("\n\n");
}

async function docxText(file: Blob) {
  const { unzipSync, strFromU8 } = await import("fflate");
  const zip = unzipSync(new Uint8Array(await file.arrayBuffer()), { filter: (f) => f.name === "word/document.xml" });
  const xml = zip["word/document.xml"] ? strFromU8(zip["word/document.xml"]) : "";
  if (!xml) throw new Error("not a Word document");
  return xml.replace(/<w:tab\/>/g, "\t").replace(/<\/w:p>/g, "\n").replace(/<w:br\/>/g, "\n").replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}

/** Read one file, or throw a clear error. */
export async function readAttachment(f: File): Promise<Attached> {
  if (f.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`${f.name} is ${(f.size / 1048576).toFixed(1)} MB: the limit is ${MAX_FILE_MB} MB.`);
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (f.type.startsWith("image/")) return { name: f.name, kind: "image", image: await shrinkImage(f), size: f.size };
  let text: string, kind: Attached["kind"];
  if (ext === "pdf" || f.type === "application/pdf") { text = await pdfText(f); kind = "pdf"; }
  else if (ext === "docx") { text = await docxText(f); kind = "docx"; }
  else if (["csv", "tsv"].includes(ext)) { text = await f.text(); kind = "csv"; }
  else if (["txt", "md", "json"].includes(ext) || f.type.startsWith("text/")) { text = await f.text(); kind = "text"; }
  else if (ext === "doc") throw new Error(`${f.name}: old .doc files can't be read. Save it as .docx or PDF.`);
  else throw new Error(`${f.name}: this file type isn't supported (PDF, DOCX, CSV, TXT, MD, JSON or images).`);
  if (!text.trim()) throw new Error(`${f.name} has no readable text (a scanned PDF? attach it as an image instead).`);
  const note = text.length > MAX_CHARS ? `only the first ${MAX_CHARS.toLocaleString()} of ${text.length.toLocaleString()} characters were sent` : undefined;
  if (kind === "csv") { const rows = text.split(/\r?\n/).filter(Boolean); text = `${rows.length} rows\n${text}`; }
  return { name: f.name, kind, text: text.slice(0, MAX_CHARS), size: f.size, note };
}
