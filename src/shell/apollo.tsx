"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ORB_STATES, type OrbState } from "@/orb/ApolloOrb";
import { syntheticSpeech, useOrbAudio } from "@/orb/useOrbAudio";
import { useTheme } from "@/theme/ThemeProvider";
import { PANEL_KINDS, panelStore, panelTitle } from "./panelStore";
import { SPACES, type IconName } from "./spaces";

export type Action = {
  id: string; group: string; label: string; hint?: string; icon: IconName | string;
  keywords: string[]; done: string; run: () => void;
};

type Ctx = {
  orbState: OrbState;
  setOrbState: (s: OrbState) => void;
  getLevel: () => number;
  reply: string | null;
  micError: string | null;
  actions: Action[];
  runAction: (a: Action) => void;
  /** Free text from the command bar or palette: runs a matching site action, otherwise asks Apollo. */
  submit: (text: string) => void;
  toggleMic: () => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
};

const ApolloCtx = createContext<Ctx | null>(null);

const VERBS = /^(please\s+)?(open|go to|goto|show|switch to|use|pull up|set (the )?(theme|style) to|theme|style)\s+(the\s+|my\s+)?/;

export function ApolloProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { presets, setTheme } = useTheme();
  const [orbState, setState] = useState<OrbState>("idle");
  const [reply, setReply] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { micOn, micError, startMic, stopMic, micLevel } = useOrbAudio();
  const stateRef = useRef(orbState);
  const timers = useRef<number[]>([]);

  useEffect(() => { stateRef.current = orbState; }, [orbState]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  const getLevel = useCallback(() => {
    if (stateRef.current === "listening") return micLevel();
    if (stateRef.current === "speaking") return syntheticSpeech(performance.now() / 1000);
    return 0;
  }, [micLevel]);

  const setOrbState = useCallback(async (next: OrbState) => {
    clearTimers();
    if (next === "listening") await startMic();
    else if (micOn) stopMic();
    setState(next);
  }, [clearTimers, micOn, startMic, stopMic]);

  const toggleMic = useCallback(() => {
    setOrbState(stateRef.current === "listening" ? "idle" : "listening");
  }, [setOrbState]);

  const actions = useMemo<Action[]>(() => [
    { id: "go:home", group: "Go to", label: "Home", icon: "home", keywords: ["home", "apollo", "orb"], done: "Home.", run: () => router.push("/") },
    ...SPACES.map((s) => ({
      id: `go:${s.id}`, group: "Go to", label: s.name, hint: s.blurb, icon: s.icon,
      keywords: [s.id, s.name.toLowerCase(), ...s.name.toLowerCase().split(" and ")],
      done: `Opened ${s.name}.`, run: () => router.push(`/s/${s.id}`),
    })),
    ...PANEL_KINDS.map((k) => ({
      id: `panel:${k}`, group: "Panels", label: `${panelTitle(k)} panel`, icon: "panel",
      keywords: [`${panelTitle(k).toLowerCase()} panel`, `${k} panel`],
      done: `${panelTitle(k)} is beside me.`, run: () => panelStore.open(k),
    })),
    ...presets.map((p) => ({
      id: `style:${p.id}`, group: "Style", label: p.name, hint: p.note, icon: "style",
      keywords: [p.id, p.name.toLowerCase()],
      done: `Switched to ${p.name}.`, run: () => setTheme(p.id),
    })),
    ...ORB_STATES.map((st) => ({
      id: `orb:${st}`, group: "Preview orb", label: `Orb: ${st}`, icon: "orb",
      keywords: [`orb ${st}`], done: "", run: () => { setOrbState(st); },
    })),
  ], [presets, router, setOrbState, setTheme]);

  const runAction = useCallback((a: Action) => {
    setPaletteOpen(false);
    a.run();
    if (a.id.startsWith("orb:")) return;
    clearTimers();
    if (micOn) stopMic();
    setReply(a.done);
    setState("acting");
    later(1100, () => setState("idle"));
    later(4200, () => setReply(null));
  }, [clearTimers, micOn, stopMic]);

  const submit = useCallback((text: string) => {
    const q = text.toLowerCase().trim().replace(/[.!?]+$/, "");
    if (!q) return;
    const bare = q.replace(VERBS, "").replace(/\s+(panel|space|page|style|theme|preset)$/, (m) => (m.trim() === "panel" ? m : ""));
    const find = (t: string) => actions.find((a) => a.label.toLowerCase() === t || a.keywords.includes(t));
    const hit = find(q) ?? find(bare);
    if (hit) return runAction(hit);
    // Anything else needs the real Apollo, which runs through the relay (phase 4).
    setPaletteOpen(false);
    clearTimers();
    if (micOn) stopMic();
    setReply(null);
    setState("thinking");
    later(1300, () => {
      setState("speaking");
      setReply("I'm not connected yet. The relay that lets me answer arrives in phase 4.");
    });
    later(5200, () => setState("idle"));
    later(9000, () => setReply(null));
  }, [actions, clearTimers, micOn, runAction, stopMic]);

  const value = useMemo(
    () => ({ orbState, setOrbState, getLevel, reply, micError, actions, runAction, submit, toggleMic, paletteOpen, setPaletteOpen }),
    [orbState, setOrbState, getLevel, reply, micError, actions, runAction, submit, toggleMic, paletteOpen],
  );
  return <ApolloCtx.Provider value={value}>{children}</ApolloCtx.Provider>;
}

export function useApollo(): Ctx {
  const v = useContext(ApolloCtx);
  if (!v) throw new Error("useApollo outside ApolloProvider");
  return v;
}
