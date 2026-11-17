"use client";
// The Tutor room: lessons that go chunk by chunk through a topic (one spec statement at a time, checked before
// moving on), a revise mode (questions first, teach only the gaps), exam practice, and free tutor chats per
// subject. Everything is saved on this page and resumes where it stopped.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoomChat, type QuickAction } from "./RoomChat";
import { EndSession } from "./EndSession";
import { useApollo as useApolloSafe } from "@/shell/apollo";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type A = any;
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics"];
const STATUS_COLOR: Record<string, string> = { todo: "var(--surface-2)", learning: "var(--accent)", understood: "#30a46c", shaky: "#f5a524", skipped: "#6b7280" };
const api = (b: object) => fetch("/api/lessons", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then((r) => r.json());
const field: React.CSSProperties = { height: 34, padding: "0 10px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" };
const nowMs = () => Date.now();

const LESSON_QUICK: QuickAction[] = [
  { label: "✓ Got it, next", text: "I understand this now. Check me with one quick question if you haven't, then move on." },
  { label: "Explain differently", text: "I don't get it yet. Explain it a completely different way (different analogy or a picture)." },
  { label: "Worked example", text: "Show me a worked example step by step (```steps), then give me a similar one to try." },
  { label: "Simpler", text: "Go simpler: assume I've forgotten the basics this builds on." },
  { label: "Diagram", text: "Show this as a diagram or graph." },
  { label: "Hint", text: "Give me a hint for your question, not the answer." },
  { label: "Harder", text: "That was fine: give me a harder, exam-style question on this chunk." },
  { label: "Real-world", text: "Where does this come up in real life or in exam questions?" },
  { label: "Flashcards", text: "Make 3-5 flashcards for this chunk and save them to my deck." },
  { label: "Quiz so far", text: "Quick quiz on everything we've covered so far in this lesson (```quiz, 4 questions)." },
  { label: "Save notes", text: "Write concise lesson notes for what we've covered (key ideas, formulas, a worked example, common mistakes) and save them with the create tool on notes (kind topic, subject, topic, spec_code)." },
];
const CHAT_QUICK: QuickAction[] = [
  { label: "I'm stuck", text: "I'm stuck. Give me a full explanation." },
  { label: "Hint only", text: "Just a hint, not the answer." },
  { label: "Mark my working", text: "I'll attach a photo: mark my working line by line against the mark scheme and show where marks were lost." },
  { label: "Similar question", text: "Give me a similar question to practise." },
  { label: "Teach as a lesson", text: "Turn this into a step-by-step lesson." },
];

export function StudyRoom() {
  const [lessons, setLessons] = useState<A[]>([]);
  const [chats, setChats] = useState<A[]>([]);
  const [lesson, setLesson] = useState<A | null>(null);
  const [chat, setChat] = useState<{ space: string; id: string | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const [tick, setTick] = useState(0);
  const load = useCallback(() => {
    void fetch("/api/lessons").then((r) => r.json()).then((j) => setLessons(Array.isArray(j) ? j.filter((l: A) => l.status !== "archived") : [])).catch(() => {});
    void fetch("/api/chats?space=tutor:").then((r) => r.json()).then((j) => setChats(Array.isArray(j) ? j : [])).catch(() => {});
  }, []);
  useEffect(() => { queueMicrotask(load); }, [load, tick]);
  const open = useCallback(async (id: string) => { const L = await fetch(`/api/lessons?id=${id}`).then((r) => r.json()); if (!L.error) { setLesson(L); setChat(null); } }, []);
  // deep links: ?lesson=<id> or ?new=subject:topic:mode (from the timetable, tests, weak spec...)
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const id = sp.get("lesson"), nw = sp.get("new");
    if (id) queueMicrotask(() => void open(id));
    else if (nw) { const [subject, topic, mode] = nw.split("|"); if (subject && topic) void api({ action: "create", subject, topic, mode: mode || "teach", plan_item_id: sp.get("plan") }).then((L) => { if (!L.error) { setLesson(L); setTick((t) => t + 1); } }); }
  }, [open]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 260px) minmax(0, 1fr)", gap: 14 }} className={u.studyGrid}>
      <aside style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <button className="pill" data-active="true" style={{ height: 40 }} onClick={() => setCreating(true)}>＋ New lesson</button>
        <div className={u.row} style={{ gap: 4, flexWrap: "wrap" }}>{SUBJ.map((s) => <button key={s} className="pill" style={{ height: 26, fontSize: 12 }} onClick={() => { setLesson(null); setChat({ space: `tutor:${s}`, id: chats.find((c) => c.space === `tutor:${s}`)?.id ?? null }); }}>💬 {s}</button>)}</div>
        <span className="label">Lessons</span>
        {!lessons.length && <small className="label">None yet. Start one: pick a topic and it goes through it chunk by chunk.</small>}
        {lessons.slice(0, 30).map((l) => (
          <button key={l.id} onClick={() => void open(l.id)} className="pill" data-active={lesson?.id === l.id} style={{ height: "auto", padding: "6px 10px", display: "grid", justifyItems: "start", textAlign: "left", gap: 2 }}>
            <b style={{ fontSize: 13 }}>{l.topic}</b>
            <small className="label">{l.subject} · {l.mode} · {l.understood}/{l.total} {l.status === "done" ? "✓ done" : ""}</small>
            <div style={{ height: 3, width: "100%", background: "var(--surface-2)", borderRadius: 2 }}><div style={{ height: 3, width: `${l.total ? (l.understood / l.total) * 100 : 0}%`, background: "#30a46c", borderRadius: 2 }} /></div>
          </button>
        ))}
        {chats.length > 0 && <span className="label">Tutor chats</span>}
        {chats.slice(0, 12).map((c) => <button key={c.id} className="pill" data-active={chat?.id === c.id} style={{ height: "auto", padding: "6px 10px", textAlign: "left", justifyContent: "flex-start" }} onClick={() => { setLesson(null); setChat({ space: c.space, id: c.id }); }}><small>{c.space.replace("tutor:", "")} · {c.title}</small></button>)}
      </aside>
      <main style={{ minWidth: 0 }}>
        {lesson ? <LessonView key={lesson.id} L={lesson} onChange={(L) => { setLesson(L); setTick((t) => t + 1); }} />
          : chat ? <div style={{ display: "grid", gap: 8 }}><b>Tutor · {chat.space.replace("tutor:", "")}</b><RoomChat key={chat.space + (chat.id ?? "")} space={chat.space} conversationId={chat.id} onConversation={(id) => { setChat({ ...chat, id }); setTick((t) => t + 1); }} mode="tutor" quick={CHAT_QUICK} context={`Free tutor chat for ${chat.space.replace("tutor:", "")}. Teach step by step, one idea at a time, end with a check question; mark photos of working line by line.`} height="70vh" /></div>
            : <Welcome onNew={() => setCreating(true)} />}
      </main>
      {creating && <NewLesson onClose={() => setCreating(false)} onMade={(L) => { setCreating(false); setLesson(L); setChat(null); setTick((t) => t + 1); }} />}
    </div>
  );
}

function Welcome({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ display: "grid", gap: 10, padding: 18, borderRadius: 14, background: "var(--surface)" }}>
      <b style={{ fontSize: 20 }}>Learn one chunk at a time</b>
      <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
        <li><b>Teach me</b>: goes through a topic statement by statement, in the order things build on each other, and only moves on when you&apos;ve shown you understand.</li>
        <li><b>Revise</b>: asks you first, and only teaches what you&apos;ve forgotten.</li>
        <li><b>Exam practice</b>: exam-style questions per statement, marked like a mark scheme.</li>
        <li>Send a photo or drawing of your working any time; it&apos;s marked line by line.</li>
        <li>Your spec confidence, mistakes, flashcards and revision minutes update as you go.</li>
      </ul>
      <button className="pill" data-active="true" style={{ justifySelf: "start", height: 40 }} onClick={onNew}>＋ Start a lesson</button>
      <ScopeStatus />
    </div>
  );
}

function NewLesson({ onClose, onMade }: { onClose: () => void; onMade: (L: A) => void }) {
  const [f, setF] = useState({ subject: "Maths", topic: "", mode: "teach", level: "A-level" });
  const [heads, setHeads] = useState<A[]>([]);
  const [weak, setWeak] = useState<A[]>([]);
  const [tests, setTests] = useState<A[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "spec_points", limit: 500 }] }) }).then((r) => r.json()).then((j) => setHeads((j?.[0]?.rows ?? []).filter((p: A) => p.level < 4))).catch(() => {});
    void fetch("/api/spec?view=weak&limit=8").then((r) => r.json()).then((j) => setWeak(j?.weak ?? [])).catch(() => {});
    void fetch("/api/tests").then((r) => r.json()).then((j) => setTests(j?.upcoming ?? [])).catch(() => {});
  }, []);
  const make = async (subject: string, topic: string, codes: string[] = [], mode = f.mode) => { setBusy(true); const L = await api({ action: "create", subject, topic, codes, mode, level: f.level }); setBusy(false); if (!L.error) onMade(L); };
  const subjHeads = heads.filter((h) => h.subject === f.subject).sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 330, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center" }}>
      <div onClick={(e) => e.stopPropagation()} className="panel" style={{ background: "var(--bg)", padding: 18, display: "grid", gap: 10, width: "min(620px, 94vw)", maxHeight: "88vh", overflowY: "auto" }}>
        <b style={{ fontSize: 18 }}>New lesson</b>
        <div className={u.row} style={{ gap: 6, flexWrap: "wrap" }}>
          <select value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} style={field}>{SUBJ.map((s) => <option key={s}>{s}</option>)}</select>
          {[["teach", "Teach me"], ["revise", "Revise"], ["exam", "Exam practice"]].map(([m, l]) => <button key={m} className="pill" data-active={f.mode === m} onClick={() => setF({ ...f, mode: m })}>{l}</button>)}
          <select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} style={field}>{["GCSE refresher", "A-level", "Stretch (beyond the spec)"].map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        <input list="spec-heads" value={f.topic} onChange={(e) => setF({ ...f, topic: e.target.value })} placeholder="Topic or spec code, e.g. 'Proof' or 1.02" style={{ ...field, height: 40 }} autoFocus />
        <datalist id="spec-heads">{subjHeads.map((h) => <option key={h.id} value={h.code}>{h.title}</option>)}</datalist>
        <button className="pill" data-active="true" disabled={!f.topic.trim() || busy} onClick={() => void make(f.subject, f.topic.trim())} style={{ height: 40, justifySelf: "start" }}>{busy ? "Planning the chunks…" : "Start"}</button>
        {subjHeads.length > 0 && <><span className="label">Spec topics</span><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{subjHeads.slice(0, 40).map((h) => <button key={h.id} className="pill" style={{ height: 26, fontSize: 12 }} onClick={() => void make(f.subject, h.title ?? h.code, [h.code])}>{h.code} {String(h.title ?? "").slice(0, 34)}</button>)}</div></>}
        {weak.length > 0 && <><span className="label">Your weakest statements</span><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{weak.map((w) => <button key={w.id} className="pill" style={{ height: 26, fontSize: 12 }} onClick={() => void make(w.subject, w.title ?? w.code, [w.code], "revise")}>{w.subject} {w.code}</button>)}</div></>}
        {tests.length > 0 && <><span className="label">Revise for a test (every topic on it)</span><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{tests.map((t) => <button key={t.id} className="pill" style={{ height: 26, fontSize: 12 }} onClick={() => void make(t.subject, t.title, t.codes, "revise")}>{t.title} · {t.days}d</button>)}</div></>}
      </div>
    </div>
  );
}

function LessonView({ L, onChange }: { L: A; onChange: (L: A) => void }) {
  const chunks: A[] = L.chunks ?? [];
  const idx = Number(L.idx ?? 0);
  const cur = chunks[idx];
  const space = `lesson:${L.id}`;
  const started = useRef(nowMs());
  const [answered, setAnswered] = useState(0);
  const step = async (action: string, extra: object = {}) => onChange(await api({ id: L.id, ...extra, action: "step", step: action }).then((r) => (r.error ? L : r)));
  // Apollo moves the lesson on with lesson_step: refresh the stepper after each reply
  useEffect(() => { const t = setInterval(async () => { const n = await fetch(`/api/lessons?id=${L.id}`).then((r) => r.json()).catch(() => null); if (n && !n.error && (n.idx !== L.idx || JSON.stringify(n.chunks) !== JSON.stringify(L.chunks))) onChange(n); }, 5000); return () => clearInterval(t); }, [L.id, L.idx, L.chunks, onChange]);
  // revision minutes are logged when you leave or end
  useEffect(() => () => { const m = Math.round((nowMs() - started.current) / 60000); if (m >= 1) void api({ action: "minutes", id: L.id, minutes: m }); }, [L.id]);
  const done = L.status === "done" || idx >= chunks.length;
  const quick = useMemo(() => LESSON_QUICK, []);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className={u.row} style={{ gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <b style={{ fontSize: 18 }}>{L.topic}</b><span className="label">{L.subject} · {L.mode === "teach" ? "Teach me" : L.mode === "revise" ? "Revise" : "Exam practice"} · {chunks.filter((c) => c.status === "understood").length}/{chunks.length} understood</span>
        <span style={{ flex: 1 }} />
        <button className="pill" disabled={idx <= 0} onClick={() => void step("back")}>◀ Back</button>
        <button className="pill" disabled={done} onClick={() => void step("skip")}>Skip ▶</button>
        <button className="pill" disabled={done} onClick={() => void step("understood", { force: true })} title="Mark this chunk understood and move on">✓ Understood</button>
      </div>
      {chunks.length > 0 && (
        <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 4 }}>
          {chunks.map((c, i) => <button key={i} onClick={() => void step("goto", { idx: i })} title={`${c.code ?? ""} ${c.title}: ${c.status}`} style={{ flex: "0 0 auto", minWidth: 54, height: 30, borderRadius: 8, border: i === idx ? "2px solid var(--text)" : "1px solid var(--border)", background: STATUS_COLOR[c.status] ?? "var(--surface-2)", color: c.status === "todo" ? "var(--text)" : "#08101f", fontSize: 11, fontWeight: 600 }}>{c.code ?? i + 1}</button>)}
        </div>
      )}
      {cur && <div style={{ padding: "8px 12px", borderRadius: 10, background: "var(--surface-2)", fontSize: 13 }}><span className="label">Chunk {idx + 1} of {chunks.length}{cur.code ? ` · spec ${cur.code}` : ""}</span><div>{cur.text || cur.title}</div>{cur.scope?.length > 0 && <div style={{ marginTop: 6 }}><span className="label">What exams ask on this</span><ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{cur.scope.map((x: A) => <li key={x.skill} style={{ listStyle: "none", marginLeft: -18 }}>{(cur.covered ?? []).includes(x.skill) ? "✅" : "⬜"} {x.skill}{x.example ? <small className="label"> · {x.example}</small> : null}</li>)}</ul></div>}</div>}
      {done && chunks.length > 0 && <div style={{ padding: "8px 12px", borderRadius: 10, background: "color-mix(in srgb, #30a46c 22%, var(--surface))" }}>Topic complete. Ask for the end-of-topic quiz, save notes, or start a revise lesson on it in a few days.</div>}
      <RoomChat key={space} space={space} conversationId={L.conversation_id ?? null} onConversation={(id) => { void api({ action: "attach", id: L.id, conversation_id: id }); onChange({ ...L, conversation_id: id }); }}
        mode="tutor" context={L.context} quick={quick} height="64vh" onSent={() => setAnswered((n) => n + 1)}
        empty={<div style={{ display: "grid", gap: 8 }}><p className="label">Press Start and Apollo begins with chunk {Math.min(idx + 1, chunks.length) || 1}{chunks.length ? ` of ${chunks.length}` : ""}. Answer its check question to move on.</p><button className="pill" data-active="true" style={{ justifySelf: "start" }} onClick={() => window.dispatchEvent(new CustomEvent("noesis:room-start", { detail: space }))}>▶ Start</button></div>} />
      <RoomStarter space={space} L={L} />
      <EndSession active kind="lesson" area="school" unit="messages" stats={{ answered, lines: [`${chunks.filter((c) => c.status === "understood").length}/${chunks.length} chunks understood · it resumes from here next time`] }} onEnd={() => { const m = Math.round((nowMs() - started.current) / 60000); if (m >= 1) void api({ action: "minutes", id: L.id, minutes: m }); started.current = nowMs(); }} />
    </div>
  );
}

/** The Start button sends the opening message through the room's own chat. */
function RoomStarter({ space, L }: { space: string; L: A }) {
  const { submit } = useApolloSafe();
  useEffect(() => {
    const f = (e: Event) => { if ((e as CustomEvent).detail === space) submit(L.mode === "revise" ? "Start: test me on the first chunk." : L.mode === "exam" ? "Start: first exam question please." : "Start the lesson with the first chunk.", { mode: "tutor", space, conversationId: L.conversation_id ?? null, context: L.context }); };
    window.addEventListener("noesis:room-start", f); return () => window.removeEventListener("noesis:room-start", f);
  }, [space, L, submit]);
  return null;
}

/** How much of the spec has its exam scope mapped (what exams ask beyond the wording), with a button to do more now. */
function ScopeStatus() {
  const [st, setSt] = useState<A>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { void api({ action: "scope_status" }).then(setSt); }, []);
  if (!st?.total) return null;
  return (
    <div style={{ padding: 10, borderRadius: 10, background: "var(--surface-2)", fontSize: 13, display: "grid", gap: 6 }}>
      <span><b>Exam scope mapped: {st.mapped}/{st.total} statements.</b> For each statement Apollo lists what exams actually ask beyond the spec wording (e.g. completing the square → turning point, max/min, line of symmetry), and lessons won&apos;t move on until those are covered. It fills in the rest in the background while your PC is on, tests first.</span>
      {st.mapped < st.total && <button className="pill" style={{ justifySelf: "start" }} onClick={async () => { const r = await api({ action: "map_scope" }); setMsg(r.queued ? `Mapping ${r.queued} more now.` : "Already working on a batch."); }}>Map the next batch now</button>}
      {msg && <small className="label">{msg}</small>}
    </div>
  );
}
