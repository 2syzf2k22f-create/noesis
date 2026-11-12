"use client";

import { useState } from "react";
import { useApollo } from "./apollo";
import s from "./shell.module.css";

/** Home: the only control on the page. Type or talk. */
export function CommandBar() {
  const { submit, toggleMic, orbState, reply, micError, setPaletteOpen } = useApollo();
  const [text, setText] = useState("");
  const said = reply ?? (micError ? `${micError}.` : null);

  return (
    <div className={s.commandWrap}>
      <p className={s.reply} aria-live="polite" data-show={!!said}>{said ?? " "}</p>
      <form
        className={`panel ${s.command}`}
        onSubmit={(e) => { e.preventDefault(); submit(text); setText(""); }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Apollo" aria-label="Message Apollo" autoComplete="off" />
        <button type="button" className={s.kbd} onClick={() => setPaletteOpen(true)} aria-label="Open command palette">⌘K</button>
        <button type="button" className={s.mic} aria-pressed={orbState === "listening"} aria-label={orbState === "listening" ? "Stop listening" : "Talk"} onClick={toggleMic}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
        </button>
      </form>
    </div>
  );
}
