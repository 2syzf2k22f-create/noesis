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
    const vh = window.innerHeight;
    const inView = (el: Element) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh && r.width > 0; };
    const clean = (t: string) => t.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    const title = document.querySelector("h1")?.textContent?.trim();
    const sub = document.querySelector("[data-ui=page-head] p")?.textContent?.trim();
    const windows = [...document.querySelectorAll<HTMLElement>("[data-window-title]")].map((w) => w.dataset.windowTitle).filter(Boolean);
    // what Reg can actually see right now: every block in the viewport, in full (each capped)
    const blocks = [...document.querySelectorAll<HTMLElement>("[data-ui=block]")];
    const visible = blocks.filter(inView).map((b) => {
      const head = b.querySelector("[data-ui=block-head]")?.textContent?.trim() ?? "(untitled block)";
      const win = (b.closest("[data-window-title]") as HTMLElement | null)?.dataset.windowTitle;
      return `[${win ? `side window "${win}" › ` : ""}${head}]\n${clean(b.innerText).slice(0, 900)}`;
    });
    const below = blocks.filter((b) => !inView(b)).map((b) => b.querySelector("[data-ui=block-head]")?.textContent?.trim()).filter(Boolean);
    const dialogs = [...document.querySelectorAll<HTMLElement>("[role=dialog]")].filter(inView).map((d) => clean(d.innerText).slice(0, 600));
    const focused = document.activeElement instanceof HTMLElement && document.activeElement.closest("[data-ui=block]") ? document.activeElement.closest("[data-ui=block]")?.querySelector("[data-ui=block-head]")?.textContent?.trim() : null;
    const fallback = !blocks.length ? clean((document.querySelector("main") ?? document.body).innerText).slice(0, 3000) : "";
    return [
      `url: ${location.pathname}`,
      title ? `page: ${title}${sub ? ` (${sub})` : ""}` : "",
      `scrolled ${Math.round(window.scrollY)}px of ${document.documentElement.scrollHeight}px; viewport ${window.innerWidth}x${vh}`,
      windows.length ? `side-by-side windows: ${windows.join(", ")}` : "",
      dialogs.length ? `open dialogs:\n${dialogs.join("\n---\n")}` : "",
      focused ? `typing in: ${focused}` : "",
      ...[...facts.entries()].map(([k, v]) => `${k}: ${v}`),
      visible.length ? `VISIBLE NOW (top to bottom):\n${visible.join("\n\n").slice(0, 7000)}` : "",
      below.length ? `further down the page: ${below.join(" | ")}` : "",
      fallback ? `visible text:\n${fallback}` : "",
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


/** A real picture of the page (for "look at my screen"); JPEG data URL, or null if it can't be captured. */
export async function screenshot(): Promise<string | null> {
  try {
    const { toJpeg } = await import("html-to-image");
    const el = document.body;
    return await toJpeg(el, {
      quality: 0.7, pixelRatio: Math.min(1, 1400 / window.innerWidth), width: window.innerWidth, height: window.innerHeight,
      style: { transform: `translateY(-${window.scrollY}px)` }, cacheBust: true,
      filter: (n) => !(n instanceof HTMLElement && (n.dataset?.chatdock !== undefined || n.tagName === "CANVAS")),
    });
  } catch { return null; }
}
export const wantsScreenshot = (q: string) => /\b(my screen|look at (this|my|the) (screen|page)|screenshot|what do you see|can you see)\b/i.test(q);
