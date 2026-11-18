"use client";
// Phone quick capture: snap the board -> a lesson note for the lesson that's on now; Apollo types up what's in
// the photo (text, maths, diagrams) under it. Add NOESIS to your home screen and long-press for "Snap the board".
import { useEffect, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics", "Other"];
async function shrink(f: File) {
  const img = await createImageBitmap(f); const k = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k; c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}
export default function Capture() {
  const { submit } = useApollo();
  const [lesson, setLesson] = useState<A>(null);
  const [subject, setSubject] = useState("");
  const [msg, setMsg] = useState("");
  const [shots, setShots] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { fetch("/api/capture").then((r) => r.json()).then((j) => { setLesson(j.lesson); setSubject(SUBJ.includes(j.lesson?.subject) ? j.lesson.subject : "Maths"); }).catch(() => {}); }, []);
  const save = async () => {
    if (!shots.length) return;
    setMsg("Saving…");
    const r = await fetch("/api/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, image: shots[0] }) }).then((x) => x.json());
    submit(`Transcribe ${shots.length > 1 ? "these photos of the board" : "this photo of the board"} from my ${subject} lesson into clean lesson notes (headings, bullet points, LaTeX maths, a \`\`\`mermaid or \`\`\`svg for any diagram, and a 'Questions I might be asked' line). Then save them into note ${r.id} with the update tool on notes: keep the photo line at the top and replace "_Transcribing…_" with the notes. Set its topic and spec_code if you can tell them.`, { mode: "tutor", images: shots.slice(0, 4), space: `notes:${r.id}`, conversationId: null, context: `Quick capture from class into note ${r.id}.` });
    setMsg("Saved. Apollo is typing it up in your Notes."); setShots([]);
  };
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "24px 16px", display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Snap the board</h1>
      <span className="label">{lesson ? `Now: ${lesson.subject} (${lesson.start}–${lesson.end}${lesson.room ? `, ${lesson.room}` : ""})` : "No lesson on right now: pick the subject."}</span>
      <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ height: 42, borderRadius: 10, padding: "0 10px", background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}>{SUBJ.map((s) => <option key={s}>{s}</option>)}</select>
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={async (e) => { const fs = [...(e.target.files ?? [])]; const out: string[] = []; for (const f of fs) out.push(await shrink(f)); setShots((x) => [...x, ...out].slice(0, 4)); e.target.value = ""; }} />
      <button className="pill" data-active="true" style={{ height: 64, fontSize: 20 }} onClick={() => input.current?.click()}>📷 Take a photo</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{shots.map((s, i) => <img key={i} src={s} alt="board" style={{ height: 90, borderRadius: 8 }} />)}</div>
      {shots.length > 0 && <button className="pill" data-active="true" style={{ height: 48 }} onClick={() => void save()}>Save as {subject} lesson note ({shots.length} photo{shots.length > 1 ? "s" : ""})</button>}
      {msg && <span className="label">{msg}</span>}
    </div>
  );
}
