import { connection } from "next/server";
import { storeOr503 } from "@/core/api";

// Where each kind of record lives on the site, and which fields to search.
const SOURCES: { table: string; fields: string[]; title: string; sub?: string[]; href: string }[] = [
  { table: "notes", fields: ["title", "body", "topic"], title: "title", sub: ["subject", "topic"], href: "/s/school/notes" },
  { table: "homework", fields: ["title", "subject", "class_name"], title: "title", sub: ["subject", "due_at"], href: "/s/school/homework" },
  { table: "flashcards", fields: ["front", "back", "topic"], title: "front", sub: ["deck", "topic"], href: "/s/school/flashcards" },
  { table: "questions", fields: ["question", "topic", "subtopic"], title: "question", sub: ["subject", "topic"], href: "/s/school/questions" },
  { table: "events", fields: ["title", "location"], title: "title", sub: ["kind", "at"], href: "/s/school/timetable" },
  { table: "inbox_items", fields: ["title", "body"], title: "title", sub: ["source"], href: "/s/inbox" },
  { table: "books", fields: ["title", "author"], title: "title", sub: ["author", "status"], href: "/s/library/books" },
  { table: "projects", fields: ["name", "summary"], title: "name", sub: ["status"], href: "/s/projects" },
  { table: "project_notes", fields: ["text", "project"], title: "text", sub: ["project"], href: "/s/projects/notes" },
  { table: "recipes", fields: ["name", "tags", "ingredients"], title: "name", sub: ["tags"], href: "/s/nutrition/recipes" },
  { table: "resource_links", fields: ["title", "url", "topic"], title: "title", sub: ["subject"], href: "/s/school/resources" },
  { table: "opportunities", fields: ["title", "summary"], title: "title", sub: ["deadline"], href: "/s/school/opportunities" },
  { table: "files", fields: ["name", "content"], title: "name", href: "/s/library/files" },
];

/** GET ?q= — search across your records (case-insensitive substring, newest first). */
export async function GET(req: Request) {
  await connection();
  const s = storeOr503();
  if (s instanceof Response) return s;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return Response.json([]);
  const words = q.split(/\s+/);
  const out: { table: string; id: string; title: string; sub: string; href: string; link?: string }[] = [];
  await Promise.all(SOURCES.map(async (src) => {
    const rows = await s.list(src.table, { order: { col: "created_at", asc: false }, limit: 1500 }).catch(() => []);
    for (const r of rows) {
      if (r.deleted_at) continue;
      const hay = src.fields.map((f) => String(r[f] ?? "")).join(" ").toLowerCase();
      if (!words.every((w) => hay.includes(w))) continue;
      out.push({ table: src.table, id: r.id, title: String(r[src.title] ?? "").slice(0, 90), sub: (src.sub ?? []).map((f) => r[f]).filter(Boolean).map((v) => (typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : String(v))).join(" · "), href: src.href, link: r.link ?? r.url ?? undefined });
      if (out.length > 60) break;
    }
  }));
  return Response.json(out.slice(0, 40));
}
