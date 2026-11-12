"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApolloOrb, ORB_STATES, type OrbState } from "@/orb/ApolloOrb";
import { syntheticSpeech, useOrbAudio } from "@/orb/useOrbAudio";
import { useTheme } from "@/theme/ThemeProvider";
import s from "./home.module.css";

function greetingFor(h: number) {
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const GLANCE = ["Revision today", "Inbox", "Sleep"];

export function Home() {
  const { preset, presets, setTheme } = useTheme();
  const [state, setState] = useState<OrbState>("idle");
  const [now, setNow] = useState<Date | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);
  const [text, setText] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const { micOn, micError, startMic, stopMic, micLevel } = useOrbAudio();
  const stateRef = useRef(state);
  const timers = useRef<number[]>([]);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const getLevel = useCallback(() => {
    if (stateRef.current === "listening") return micLevel();
    if (stateRef.current === "speaking") return syntheticSpeech(performance.now() / 1000);
    return 0;
  }, [micLevel]);

  const clearTimers = () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };
  useEffect(() => clearTimers, []);

  const pick = async (next: OrbState) => {
    clearTimers();
    if (next === "listening") await startMic();
    else if (micOn) stopMic();
    setState(next);
  };

  const toggleMic = () => pick(state === "listening" ? "idle" : "listening");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setText("");
    setReply(null);
    clearTimers();
    if (micOn) stopMic();
    setState("thinking");
    timers.current.push(
      window.setTimeout(() => {
        setState("speaking");
        setReply("I'm not connected yet. The relay that lets me answer arrives in phase 4.");
      }, 1400),
      window.setTimeout(() => setState("idle"), 5200),
    );
  };

  const hh = now ? String(now.getHours()).padStart(2, "0") : "--";
  const mm = now ? String(now.getMinutes()).padStart(2, "0") : "--";
  const date = now
    ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : " ";

  return (
    <div className={s.root}>
      <header className={s.top}>
        <div className={s.brand}>
          <span className={s.mark} aria-hidden />
          <span>NOESIS</span>
        </div>
        <div className={s.topRight}>
          <span className="pill" title="The relay is built in phase 4">
            <span className={s.dot} data-on="false" />
            Relay offline
          </span>
          <div className={s.styleWrap}>
            <button
              className="pill"
              aria-expanded={styleOpen}
              aria-haspopup="listbox"
              onClick={() => setStyleOpen((o) => !o)}
            >
              <span className={s.swatch} style={{ background: `linear-gradient(135deg, ${preset.swatch[1]}, ${preset.swatch[2]})` }} />
              {preset.name}
            </button>
            {styleOpen && (
              <div className={`panel ${s.styleMenu}`} role="listbox" aria-label="Style preset">
                <div className="label">Style</div>
                {presets.map((p) => (
                  <button
                    key={p.id}
                    role="option"
                    aria-selected={p.id === preset.id}
                    className={s.styleItem}
                    onClick={() => { setTheme(p.id); setStyleOpen(false); }}
                  >
                    <span className={s.chip} style={{ background: p.swatch[0] }}>
                      <i style={{ background: p.swatch[1] }} />
                      <i style={{ background: p.swatch[2] }} />
                    </span>
                    <span>
                      <b>{p.name}</b>
                      <small>{p.note}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={s.stage}>
        <section className={s.timeBlock} aria-label="Time">
          <div className={`display ${s.clock}`}>
            {hh}
            <span className={s.colon}>:</span>
            {mm}
          </div>
          <div className="label">{date}</div>
        </section>

        <div className={s.orbWrap}>
          <ApolloOrb className={s.orb} state={state} theme={preset.orb} getLevel={getLevel} />
          <div className={`label ${s.stateTag}`} aria-live="polite">Apollo · {state}</div>
        </div>

        <section className={s.glance} aria-label="At a glance">
          {GLANCE.map((g) => (
            <div key={g} className={s.stat}>
              <div className="label">{g}</div>
              <div className={s.statValue}>no data</div>
            </div>
          ))}
        </section>
      </main>

      <footer className={s.bottom}>
        <p className={s.greeting}>
          {reply ?? (
            <>
              {now ? greetingFor(now.getHours()) : "Hello"}, Reg.{" "}
              <span>Nothing is connected yet, so there&apos;s nothing new to report.</span>
            </>
          )}
        </p>

        <form className={`panel ${s.command}`} onSubmit={submit}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask Apollo, or press the mic"
            aria-label="Command"
            autoComplete="off"
          />
          <kbd className={s.kbd}>⌘K</kbd>
          <button
            type="button"
            className={s.mic}
            aria-pressed={state === "listening"}
            aria-label={state === "listening" ? "Stop listening" : "Talk"}
            onClick={toggleMic}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          </button>
        </form>
        {micError && <p className={s.error}>{micError}. The orb will still show the listening state.</p>}

        <div className={s.states} role="group" aria-label="Preview orb states">
          <span className="label">Preview</span>
          {ORB_STATES.map((st) => (
            <button key={st} className="pill" aria-pressed={state === st} onClick={() => pick(st)}>
              {st}
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
