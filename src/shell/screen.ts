"use client";
// What's on screen right now, for Apollo. Components register short structured facts
// (e.g. the chess position being viewed); the chatbox sends them with each question.

import { useEffect } from "react";

const facts = new Map<string, string>();

export const screenContext = {
  set(key: string, value: string | null) { if (value) facts.set(key, value.slice(0, 2000)); else facts.delete(key); },
  /** A compact description of the page and everything registered. */
  snapshot(): string {
    if (typeof document === "undefined") return "";
    const title = document.querySelector("h1")?.textContent?.trim();
    const windows = [...document.querySelectorAll<HTMLElement>("[data-window-title]")].map((w) => w.dataset.windowTitle).filter(Boolean);
    const blocks = [...document.querySelectorAll<HTMLElement>("[data-ui=block-head]")].map((b) => b.textContent?.trim()).filter(Boolean).slice(0, 30);
    const main = (document.querySelector("main") ?? document.body).innerText.replace(/\s+\n/g, "\n").replace(/\n{2,}/g, "\n").slice(0, 1500);
    return [
      `url: ${location.pathname}`,
      title ? `page: ${title}` : "",
      windows.length ? `side-by-side windows: ${windows.join(", ")}` : "",
      blocks.length ? `blocks on screen: ${blocks.join(" | ")}` : "",
      ...[...facts.entries()].map(([k, v]) => `${k}: ${v}`),
      `visible text (trimmed):\n${main}`,
    ].filter(Boolean).join("\n");
  },
};

/** Register a fact while the component is mounted. */
export function useScreenContext(key: string, value: string | null) {
  useEffect(() => {
    screenContext.set(key, value);
    return () => screenContext.set(key, null);
  }, [key, value]);
}

/** Only send the screen when the question is about it (saves tokens on everything else). */
export const aboutScreen = (q: string) => /\b(this|these|that|here|screen|page|shown|showing|see|graph|chart|board|position|move|question|explain|what does|what's this|whats this|why is|highlight|point|where)\b/i.test(q);
