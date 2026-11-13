"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ORB_STATES, type OrbState } from "@/orb/ApolloOrb";
import { syntheticSpeech, useOrbAudio } from "@/orb/useOrbAudio";
import { createSpeaker, listenOnce, pickVoice, sttSupported, ttsSupported, wakeWord, type Listener } from "@/voice/voice";
import { useTheme } from "@/theme/ThemeProvider";
import { MODEL_PREFS, biggerModel, type ModelPref } from "@/core/routing";
import type { UiAction } from "@/core/tools";
import { PANEL_KINDS, panelStore, panelTitle, type PanelKind } from "./panelStore";
import { SPACES, type IconName } from "./spaces";
import { boardAnnotations } from "@/chess/Board";
import { screenContext } from "./screen";
import { uiStore } from "./uiStore";

export type Action = {
  id: string; group: string; label: string; hint?: string; icon: IconName | string;
  keywords: string[]; done: string; run: () => void;
};

export type Reply = {
  text: string;
  /** Model family that answered, when Apollo answered. */
  model?: string;
  escalated?: boolean;
  /** The question, so "retry bigger" can resend it. */
  ask?: string;
  pending?: boolean;
  tone?: "info" | "error";
};

export type Status = {
  configured: boolean;
  store?: string;
  relay?: { online: boolean; lastHeartbeat: string | null; busy: boolean; host: string | null };
  queued?: number;
  backAt?: string | null;
  plan?: Record<string, { utilization: number; resetsAt: number }> | null;
  planAt?: string | null;
  tokens?: { today: number; week: number; last: number | null };
};

type Ctx = {
  orbState: OrbState;
  setOrbState: (s: OrbState) => void;
  getLevel: () => number;
  reply: Reply | null;
  micError: string | null;
  actions: Action[];
  runAction: (a: Action) => void;
  /** Site commands run instantly in the browser; anything else goes to Apollo via the relay. */
  submit: (text: string, opts?: { model?: ModelPref; spoken?: boolean; mode?: string; thread?: string }) => void;
  toggleMic: () => void;
  /** Push-to-talk: start on press, stop (and send) on release. */
  startListening: () => void;
  stopListening: () => void;
  /** Live transcript while you talk. */
  draft: string;
  voice: { speak: SpeakPref; wake: boolean; stt: boolean };
  setSpeak: (p: SpeakPref) => void;
  setWake: (on: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (o: boolean) => void;
  model: ModelPref;
  setModel: (m: ModelPref) => void;
  chatId: string | null;
  openChat: (id: string | null) => void;
  /** The conversation the latest question went to (the main chat or a named thread). */
  activeConv: string | null;
  /** A short note like "New topic, so I started a new chat." */
  notice: string | null;
  status: Status | null;
  refreshStatus: () => void;
  /** Bumps when Apollo changed something, so undo UI can appear. */
  changes: number;
  undoApollo: (actionId?: string) => Promise<void>;
};

export type SpeakPref = "voice" | "always" | "never";
const ApolloCtx = createContext<Ctx | null>(null);
const SPEAK_KEY = "noesis.speak";
const WAKE_KEY = "noesis.wake";

const VERBS = /^(please\s+)?(open|go to|goto|show|switch to|use|pull up|set (the )?(theme|style) to|theme|style)\s+(the\s+|my\s+)?/;
const CHAT_KEY = "noesis.chat";
const MODEL_KEY = "noesis.model";
const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string | null) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
const family = (m?: string) => (m ? (/(haiku|sonnet|opus)/.exec(m)?.[1] ?? m) : undefined);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ApolloProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { presets, setTheme, reloadThemes } = useTheme();
  const [orbState, setState] = useState<OrbState>("idle");
  const [reply, setReply] = useState<Reply | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [model, setModelState] = useState<ModelPref>("auto");
  const [chatId, setChatId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [changes, setChanges] = useState(0);
  const [activeConv, setActiveConv] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { micOn, micError, startMic, stopMic, micLevel } = useOrbAudio();
  const stateRef = useRef(orbState);
  const timers = useRef<number[]>([]);
  const runId = useRef(0);
  const [draft, setDraft] = useState("");
  const [speakPref, setSpeakPref] = useState<SpeakPref>("always");
  const [wake, setWakeState] = useState(false);
  const [stt, setStt] = useState(false);
  const listener = useRef<Listener | null>(null);
  const speaker = useRef<ReturnType<typeof createSpeaker> | null>(null);
  const lastWord = useRef(0);
  const submitRef = useRef<Ctx["submit"]>(() => {});

  useEffect(() => {
    const sp = ls.get(SPEAK_KEY) as SpeakPref | null;
    const wk = ls.get(WAKE_KEY) === "1";
    queueMicrotask(() => {
      setStt(sttSupported());
      if (sp === "voice" || sp === "always" || sp === "never") setSpeakPref(sp);
      setWakeState(wk);
    });
    if (ttsSupported()) { pickVoice(); speechSynthesis.onvoiceschanged = () => pickVoice(); }
  }, []);
  const setSpeak = useCallback((p: SpeakPref) => { setSpeakPref(p); ls.set(SPEAK_KEY, p); }, []);
  const setWake = useCallback((on: boolean) => { setWakeState(on); ls.set(WAKE_KEY, on ? "1" : "0"); }, []);

  useEffect(() => { stateRef.current = orbState; }, [orbState]);

  // restore per-device preferences after mount (no hydration mismatch)
  useEffect(() => {
    const m = ls.get(MODEL_KEY) as ModelPref | null;
    const c = ls.get(CHAT_KEY);
    queueMicrotask(() => {
      if (m && MODEL_PREFS.includes(m)) setModelState(m);
      if (c) setChatId(c);
    });
  }, []);

  const setModel = useCallback((m: ModelPref) => { setModelState(m); ls.set(MODEL_KEY, m); }, []);
  const openChat = useCallback((id: string | null) => { setChatId(id); ls.set(CHAT_KEY, id); }, []);

  const refreshStatus = useCallback(() => {
    fetch("/api/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    refreshStatus();
    const id = window.setInterval(refreshStatus, 20_000);
    return () => window.clearInterval(id);
  }, [refreshStatus]);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);
  const later = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  const getLevel = useCallback(() => {
    if (stateRef.current === "listening") return micLevel();
    if (stateRef.current === "speaking") {
      const t = performance.now();
      if (speaker.current && t - lastWord.current < 1500) {
        // real TTS: words drive the energy (browser speech audio can't be analysed directly)
        const e = Math.max(0, 1 - (t - lastWord.current) / 380);
        return Math.min(1, 0.2 + e * 0.8) * (0.65 + 0.35 * syntheticSpeech(t / 1000));
      }
      return speaker.current ? 0.08 : syntheticSpeech(t / 1000);
    }
    return 0;
  }, [micLevel]);

  const setOrbState = useCallback(async (next: OrbState) => {
    clearTimers();
    if (next === "listening") await startMic();
    else if (micOn) stopMic();
    setState(next);
  }, [clearTimers, micOn, startMic, stopMic]);

  const stopListening = useCallback(() => { listener.current?.stop(); }, []);

  const startListening = useCallback((untilStopped = false) => {
    if (listener.current) return;
    speaker.current?.cancel();
    speaker.current = null;
    void setOrbState("listening");
    setDraft("");
    const l = listenOnce({
      onInterim: setDraft,
      onFinal: (t) => { setDraft(""); submitRef.current(t, { spoken: true }); },
      onEnd: () => {
        listener.current = null;
        setDraft("");
        if (stateRef.current === "listening") void setOrbState("idle");
      },
      onError: (e) => { if (e === "not-allowed") setReply({ text: "Microphone permission is blocked for this site.", tone: "error" }); },
    }, { untilStopped });
    if (!l) setReply({ text: "This browser has no speech recognition. Chrome, Edge or Safari do.", tone: "info" });
    listener.current = l;
  }, [setOrbState]);

  const toggleMic = useCallback(() => {
    if (listener.current) stopListening();
    else if (stateRef.current === "listening") void setOrbState("idle");
    else startListening(true);
  }, [setOrbState, startListening, stopListening]);

  // Wake word: only while idle (two recognisers can't share the mic)
  useEffect(() => {
    if (!wake || orbState !== "idle") return;
    const w = wakeWord("apollo", (rest) => {
      if (rest) submitRef.current(rest, { spoken: true });
      else startListening();
    });
    return () => w?.abort();
  }, [wake, orbState, startListening]);

  // Alt+P toggles listening (works anywhere, even while typing): press to start, talk with pauses, press again to send
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (!(e.altKey && e.code === "KeyP") || e.repeat) return;
      e.preventDefault();
      if (listener.current) stopListening(); else startListening(true);
    };
    const up = (e: KeyboardEvent) => { if (e.key === "Alt") e.preventDefault(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [startListening, stopListening]);

  const applyUi = useCallback((ui: UiAction) => {
    if (ui.type === "navigate") {
      const [space, sub] = ui.to.split("--");
      router.push(ui.to === "home" ? "/" : SPACES.some((s) => s.id === space) ? (sub ? `/s/${space}/${sub}` : `/s/${space}`) : `/p/${ui.to}`);
    }
    else if (ui.type === "open_panel" && ui.kind === "widget" && ui.widget) panelStore.open("widget", ui.widget);
    else if (ui.type === "open_panel" && (PANEL_KINDS as string[]).includes(ui.kind)) panelStore.open(ui.kind as PanelKind);
    else if (ui.type === "set_theme") setTheme(ui.id);
    else if (ui.type === "reload") { void reloadThemes(); setChanges((c) => c + 1); }
    // after a navigation the element may not exist yet, so wait a moment
    else if (ui.type === "highlight") setTimeout(() => uiStore.highlight(ui.target, ui.label, ui.ms), 400);
    else if (ui.type === "chatbox") {
      if (ui.near) setTimeout(() => { if (!uiStore.placeNear(ui.near!, { w: ui.w, h: ui.h })) uiStore.setChat({ open: true }); }, 350);
      else if (ui.x != null || ui.y != null || ui.w != null || ui.h != null) {
        const b = uiStore.get().chat.box ?? { x: 104, y: 12, w: 380, h: 420 };
        uiStore.setChat({ open: ui.open ?? true, box: { x: ui.x ?? b.x, y: ui.y ?? b.y, w: ui.w ?? b.w, h: ui.h ?? b.h } });
      } else if (ui.open != null) uiStore.setChat({ open: ui.open });
    }
    else if (ui.type === "open_window") uiStore.openWindow(ui.to);
    else if (ui.type === "close_window") uiStore.closeWindow(ui.to);
    else if (ui.type === "annotate_board") boardAnnotations.set({ arrows: ui.arrows ?? [], squares: ui.squares ?? {}, note: ui.note, fen: ui.fen });
  }, [reloadThemes, router, setTheme]);

  const actions = useMemo<Action[]>(() => [
    { id: "go:home", group: "Go to", label: "Home", icon: "home", keywords: ["home", "apollo", "orb"], done: "Home.", run: () => router.push("/") },
    ...SPACES.map((s) => ({
      id: `go:${s.id}`, group: "Go to", label: s.name, hint: s.blurb, icon: s.icon,
      keywords: [s.id, s.name.toLowerCase(), ...s.name.toLowerCase().split(" and ")],
      done: `Opened ${s.name}.`, run: () => router.push(`/s/${s.id}`),
    })),
    ...SPACES.flatMap((s) => (s.subs ?? []).map((x) => ({
      id: `go:${s.id}/${x.id}`, group: "Go to", label: `${s.name} › ${x.name}`, hint: x.blurb, icon: s.icon,
      keywords: [x.name.toLowerCase(), `${s.id} ${x.id}`, `${s.name.toLowerCase()} ${x.name.toLowerCase()}`],
      done: `Opened ${x.name}.`, run: () => router.push(`/s/${s.id}/${x.id}`),
    }))),
    ...SPACES.flatMap((s) => [{ id: s.id, name: s.name }, ...(s.subs ?? []).map((x) => ({ id: `${s.id}--${x.id}`, name: `${s.name} › ${x.name}` }))]).filter((x) => x.id !== "chats").map((x) => ({
      id: `win:${x.id}`, group: "Side by side", label: `${x.name} (side by side)`, icon: "panel" as IconName,
      keywords: [`${x.name.toLowerCase()} side by side`, `open ${x.name.toLowerCase()} next to this`],
      done: `${x.name} is open beside this page.`, run: () => uiStore.openWindow(x.id),
    })),
    { id: "win:close", group: "Side by side", label: "Close side-by-side windows", icon: "close" as IconName, keywords: ["close windows", "close side by side"], done: "Closed.", run: () => uiStore.closeWindow() },
    { id: "chatbox:reset", group: "Apollo", label: "Reset chatbox position", icon: "orb", keywords: ["reset chatbox", "move chatbox back"], done: "Chatbox is back by the orb.", run: () => uiStore.setChat({ box: null }) },
    ...(["voice", "always", "never"] as SpeakPref[]).map((p) => ({
      id: `speak:${p}`, group: "Voice", label: `Spoken replies: ${p === "voice" ? "when I talk" : p}`, icon: "orb",
      keywords: [`speak ${p}`, p === "never" ? "mute" : p === "always" ? "unmute" : "voice replies"],
      done: p === "never" ? "I won't read replies aloud." : p === "always" ? "I'll read every reply aloud." : "I'll speak when you talk to me.", run: () => setSpeak(p),
    })),
    { id: "wake:on", group: "Voice", label: "Wake word on (\"Apollo\")", icon: "orb", keywords: ["wake word on", "hey apollo"], done: "Say \"Apollo\" any time this page is open.", run: () => setWake(true) },
    { id: "wake:off", group: "Voice", label: "Wake word off", icon: "orb", keywords: ["wake word off"], done: "Wake word off.", run: () => setWake(false) },
    { id: "chat:new", group: "Apollo", label: "New chat", icon: "chats", keywords: ["new chat", "new conversation", "clear chat"], done: "New chat.", run: () => { openChat(null); router.push("/"); } },
    { id: "apollo:undo", group: "Apollo", label: "Undo Apollo", hint: "Undo the last change Apollo made", icon: "undo", keywords: ["undo", "undo apollo"], done: "", run: () => { void undoRef.current(); } },
    ...MODEL_PREFS.map((m) => ({
      id: `model:${m}`, group: "Model", label: `Model: ${m[0].toUpperCase()}${m.slice(1)}`, icon: "orb",
      keywords: [`model ${m}`, `use ${m}`], done: `Using ${m === "auto" ? "Auto" : m[0].toUpperCase() + m.slice(1)}.`, run: () => setModel(m),
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
  ], [openChat, presets, router, setModel, setOrbState, setSpeak, setTheme, setWake]);

  const settle = useCallback((r: Reply, ms = 9000) => {
    setReply(r);
    later(ms, () => setReply((cur) => (cur === r ? null : cur)));
  }, []);

  const undoApollo = useCallback(async (actionId?: string) => {
    clearTimers();
    const res = await fetch("/api/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(actionId ? { actionId } : {}) })
      .then((r) => r.json()).catch(() => null);
    if (!res || res.error === "not_configured") return settle({ text: "Undo needs the database, which isn't connected yet.", tone: "error" });
    (res.ui as UiAction[] | undefined)?.forEach(applyUi);
    setChanges((c) => c + 1);
    setState("acting");
    later(900, () => setState("idle"));
    settle({ text: res.undone ? `Undid ${res.undone === 1 ? "the last change" : `${res.undone} changes`}.` : "Nothing to undo." }, 4500);
  }, [applyUi, clearTimers, settle]);
  const undoRef = useRef(undoApollo);
  useEffect(() => { undoRef.current = undoApollo; }, [undoApollo]);

  const runAction = useCallback((a: Action) => {
    setPaletteOpen(false);
    a.run();
    if (a.id.startsWith("orb:") || a.id === "apollo:undo") return;
    clearTimers();
    if (micOn) stopMic();
    setState("acting");
    later(1100, () => setState("idle"));
    settle({ text: a.done }, 4200);
  }, [clearTimers, micOn, settle, stopMic]);

  const ask = useCallback(async (text: string, m: ModelPref, speak: boolean, mode?: string, thread?: string) => {
    const my = ++runId.current;
    clearTimers();
    if (micOn) stopMic();
    speaker.current?.cancel();
    speaker.current = speak && ttsSupported()
      ? createSpeaker({
          onStart: () => setState("speaking"),
          onWord: () => { lastWord.current = performance.now(); },
          onEnd: () => { if (my === runId.current) { speaker.current = null; setState((s) => (s === "speaking" ? "idle" : s)); } },
        })
      : null;
    setState("thinking");
    setNotice(null);
    setReply({ text: "", pending: true, ask: text });
    // common questions are answered from your data without the relay (no tokens)
    if (!mode && !thread) {
      const quick = await fetch("/api/quick", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (quick?.answer && my === runId.current) {
        setState("speaking");
        speaker.current?.feed(quick.answer, true);
        if (!speaker.current) later(1500, () => setState("idle"));
        return settle({ text: quick.answer, model: "instant", ask: text }, 30_000);
      }
    }
    const res = await fetch("/api/ask", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, model: m, mode, thread, conversationId: thread ? null : ls.get(CHAT_KEY), screen: screenContext.snapshot() }),
    }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) })).catch(() => null);

    if (!res || !res.ok) {
      setState("idle");
      const notConfigured = res?.body?.error === "not_configured";
      return settle({ text: notConfigured ? "My database isn't connected yet, so I can't answer. Site commands still work." : "Couldn't reach the site's server.", tone: "error" });
    }
    if (!thread) openChat(res.body.conversationId);
    if (res.body.switched) setNotice(res.body.switched === "new" ? "New topic, so I started a new chat." : `Back to your earlier chat${res.body.switchedTitle ? `: ${res.body.switchedTitle}` : ""}.`);
    setActiveConv(res.body.conversationId);
    if (!res.body.relayOnline) {
      setReply({ text: "Your PC's relay is offline. I've queued this and will answer when it's back.", pending: true, ask: text, tone: "info" });
    }

    const seen = new Set<string>();
    let lastText = "";
    for (let i = 0; i < 2400 && my === runId.current; i++) {
      await sleep(i < 20 ? 400 : 900);
      const j = await fetch(`/api/jobs/${res.body.jobId}`).then((r) => r.json()).catch(() => null);
      if (!j || my !== runId.current) continue;
      (j.ui as UiAction[]).forEach((u, k) => {
        const key = `${k}`;
        if (seen.has(key)) return;
        seen.add(key);
        applyUi(u);
        setChanges((c) => c + 1);
        if (u.type !== "navigate" && u.type !== "open_panel") setState("acting");
      });
      const t: string = j.output?.text ?? "";
      if (j.status === "running" && t && t !== lastText) {
        lastText = t;
        setState("speaking");
        setReply({ text: t, pending: true, ask: text, model: family(j.output?.model) });
        speaker.current?.feed(t);
      }
      if (j.status === "rate_limited") {
        const at = j.retryAt ? new Date(j.retryAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "soon";
        setState("idle");
        setReply({ text: `Plan limit reached. Queued; back at ${at}.`, pending: true, ask: text, tone: "info" });
        continue;
      }
      if (j.status === "done") {
        if (j.output?.actions) setChanges((c) => c + 1);
        setState("speaking");
        const words = (j.output?.text ?? "").split(/\s+/).length;
        if (speaker.current) speaker.current.feed(j.output?.text ?? "", true);
        else later(Math.min(9000, 1200 + words * 260), () => setState("idle"));
        refreshStatus();
        return settle({ text: j.output?.text ?? "", model: family(j.output?.family ?? j.output?.model), escalated: !!j.output?.escalated, ask: text }, 30_000);
      }
      if (j.status === "error") {
        setState("idle");
        return settle({ text: j.error ?? "Something went wrong.", tone: "error", ask: text });
      }
    }
  }, [applyUi, clearTimers, micOn, openChat, refreshStatus, settle, stopMic]);

  const submit = useCallback((text: string, opts?: { model?: ModelPref; spoken?: boolean; mode?: string; thread?: string }) => {
    const q = text.toLowerCase().trim().replace(/[.!?]+$/, "");
    if (!q) return;
    // Build mode starts only from Reg's own words: "build: <change>"
    const bm = /^\s*build\s*:\s*([\s\S]{5,})$/i.exec(text);
    if (bm) {
      void fetch("/api/build", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: bm[1].trim() }) })
        .then((r) => r.json()).then((j) => settle({ text: j.id ? "Build queued. Follow it on Projects › Build NOESIS." : j.error ?? "Couldn't queue the build.", tone: j.id ? undefined : "error" }, 6000))
        .catch(() => settle({ text: "Couldn't reach the server.", tone: "error" }));
      router.push("/s/projects/build");
      return;
    }
    if (!opts?.model && !opts?.mode && !opts?.thread) {
      const bare = q.replace(VERBS, "").replace(/\s+(panel|space|page|style|theme|preset)$/, (m) => (m.trim() === "panel" ? m : ""));
      const find = (t: string) => actions.find((a) => a.label.toLowerCase() === t || a.keywords.includes(t));
      const hit = find(q) ?? find(bare);
      if (hit) return runAction(hit);
    }
    setPaletteOpen(false);
    void ask(text.trim(), opts?.model ?? model, speakPref === "always" || (speakPref === "voice" && !!opts?.spoken), opts?.mode, opts?.thread);
  }, [actions, ask, model, runAction, speakPref, router, settle]);
  useEffect(() => { submitRef.current = submit; }, [submit]);

  const value = useMemo(
    () => ({
      orbState, setOrbState, getLevel, reply, micError, actions, runAction, submit, toggleMic, paletteOpen, setPaletteOpen,
      model, setModel, chatId, openChat, activeConv, notice, status, refreshStatus, changes, undoApollo,
      startListening, stopListening, draft, voice: { speak: speakPref, wake, stt }, setSpeak, setWake,
    }),
    [orbState, setOrbState, getLevel, reply, micError, actions, runAction, submit, toggleMic, paletteOpen, model, setModel, chatId, openChat, activeConv, notice, status, refreshStatus, changes, undoApollo, startListening, stopListening, draft, speakPref, wake, stt, setSpeak, setWake],
  );
  return <ApolloCtx.Provider value={value}>{children}</ApolloCtx.Provider>;
}

export function useApollo(): Ctx {
  const v = useContext(ApolloCtx);
  if (!v) throw new Error("useApollo outside ApolloProvider");
  return v;
}

export { biggerModel };
