"use client";
// Small things that make the site nicer everywhere:
//  - Select any text on any page -> a little "Explain" / "Flashcard" / "Note" button (Apollo answers in the chat).
//  - Offline banner (and that reviews still work offline).
//  - "?" opens the keyboard shortcuts sheet.
import { useEffect, useState } from "react";
import { useApollo } from "./apollo";

export function Extras() {
  const { submit } = useApollo();
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const [offline, setOffline] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const up = () => setTimeout(() => {
      const s = window.getSelection(); const t = s?.toString().trim() ?? "";
      const el = s?.anchorNode?.parentElement;
      if (!s || t.length < 4 || t.length > 2000 || el?.closest("input,textarea,[contenteditable],[data-no-explain]")) { setSel(null); return; }
      const r = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text: t, x: Math.min(window.innerWidth - 250, Math.max(8, r.left + r.width / 2 - 120)), y: Math.max(8, r.top - 42) });
    }, 10);
    const down = (e: MouseEvent) => { if (!(e.target as HTMLElement)?.closest?.("[data-explain-bar]")) setSel(null); };
    const k = (e: KeyboardEvent) => { if (e.key === "?" && !(e.target as HTMLElement)?.closest?.("input,textarea,select,[contenteditable]")) setHelp((h) => !h); if (e.key === "Escape") setHelp(false); };
    const on = () => setOffline(!navigator.onLine);
    document.addEventListener("mouseup", up); document.addEventListener("mousedown", down); window.addEventListener("keydown", k);
    window.addEventListener("online", on); window.addEventListener("offline", on); queueMicrotask(on);
    return () => { document.removeEventListener("mouseup", up); document.removeEventListener("mousedown", down); window.removeEventListener("keydown", k); window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  const go = (t: string) => { submit(t); setSel(null); window.getSelection()?.removeAllRanges(); };
  return (
    <>
      {sel && (
        <div data-explain-bar style={{ position: "fixed", left: sel.x, top: sel.y, zIndex: 350, display: "flex", gap: 4, padding: 4, borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 6px 20px rgba(0,0,0,.35)" }}>
          <button className="pill" style={{ height: 28, fontSize: 12 }} onClick={() => go(`Explain this simply, with an example: "${sel.text}"`)}>✨ Explain</button>
          <button className="pill" style={{ height: 28, fontSize: 12 }} onClick={() => go(`Make 1-3 flashcards from this and save them (deck = the subject it belongs to): "${sel.text}"`)}>⚡ Flashcard</button>
          <button className="pill" style={{ height: 28, fontSize: 12 }} onClick={() => go(`Save this to my notes (topic note, sensible title, subject and topic): "${sel.text}"`)}>📝 Note</button>
        </div>
      )}
      {offline && <div style={{ position: "fixed", bottom: 10, left: "50%", transform: "translateX(-50%)", zIndex: 350, padding: "6px 14px", borderRadius: 999, background: "#f5a524", color: "#111", fontSize: 13 }}>Offline: reviews and saved pages still work; answers sync when you&apos;re back.</div>}
      {help && (
        <div onClick={() => setHelp(false)} style={{ position: "fixed", inset: 0, zIndex: 360, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center" }}>
          <div onClick={(e) => e.stopPropagation()} className="panel" style={{ background: "var(--bg)", padding: 18, width: "min(520px, 94vw)", display: "grid", gap: 6 }}>
            <b style={{ fontSize: 18 }}>Keyboard shortcuts</b>
            {[["Ctrl+K", "Command palette (go anywhere, change anything)"], ["/", "Type to Apollo from anywhere"], ["Alt+P", "Talk to Apollo (press again to send); works system-wide with the desktop app"], ["Esc / Ctrl+E", "End the current session; Esc also stops Apollo speaking"], ["1-4, Space, Z", "Review sessions: rate, flip, undo"], ["Select text", "Explain it, make a flashcard, or save it as a note"], ["?", "This sheet"]].map(([k, v]) => <div key={k} style={{ display: "flex", gap: 10 }}><kbd style={{ minWidth: 110 }}>{k}</kbd><span>{v}</span></div>)}
          </div>
        </div>
      )}
    </>
  );
}
