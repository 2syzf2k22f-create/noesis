"use client";
// Chooses the orb: the full 3D one (three.js, loaded on its own after the page, never blocking it) or a light
// CSS orb on low-powered machines (school laptops, battery saver, reduced motion, no WebGL).
// Setting: localStorage "noesis.orb" = auto | 3d | lite (Apollo panel). Auto picks lite on 4 cores / 4 GB or less.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { OrbTheme } from "@/theme/presets";
import type { OrbState } from "./states";

type Props = { state: OrbState; theme: OrbTheme; getLevel: () => number; small?: boolean; className?: string };
const Orb3D = dynamic(() => import("./ApolloOrb").then((m) => m.ApolloOrb), { ssr: false, loading: () => null });
export const ORB_KEY = "noesis.orb";

export function liteDevice() {
  if (typeof window === "undefined") return false;
  let pref = "auto"; try { pref = localStorage.getItem(ORB_KEY) ?? "auto"; } catch {}
  if (pref === "3d") return false;
  if (pref === "lite") return true;
  const n = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const webgl = (() => { try { return !!document.createElement("canvas").getContext("webgl2"); } catch { return false; } })();
  return !webgl || (n.hardwareConcurrency ?? 8) <= 4 || (n.deviceMemory ?? 8) <= 4 || !!n.connection?.saveData || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function OrbHost(p: Props) {
  const [mode, setMode] = useState<"pending" | "3d" | "lite">("pending");
  useEffect(() => {
    const pick = () => setMode(liteDevice() ? "lite" : "3d");
    // the 3D orb starts after the page is usable
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(pick, { timeout: 1500 }); else setTimeout(pick, 300);
    const f = () => pick(); window.addEventListener("noesis:orb-pref", f);
    return () => window.removeEventListener("noesis:orb-pref", f);
  }, []);
  if (mode === "3d") return <Orb3D {...p} />;
  return <LiteOrb {...p} />;
}

const COLORS: Record<OrbState, string> = { idle: "var(--accent)", listening: "#ff5d73", thinking: "#9b8cff", speaking: "#3ee0ff", acting: "#f5a524" };
function LiteOrb({ state, small, className }: Props) {
  const c = COLORS[state];
  return (
    <div className={className} aria-hidden style={{ display: "grid", placeItems: "center" }}>
      <div style={{
        width: small ? "70%" : "min(46vmin, 360px)", aspectRatio: "1", borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, #fff 0%, ${c} 28%, color-mix(in srgb, ${c} 40%, #050814) 70%)`,
        boxShadow: `0 0 ${small ? 18 : 60}px color-mix(in srgb, ${c} 55%, transparent)`,
        animation: `noesisOrbPulse ${state === "thinking" ? 1.1 : state === "idle" ? 4 : 1.8}s ease-in-out infinite`, transition: "background .4s, box-shadow .4s",
      }} />
      <style>{"@keyframes noesisOrbPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}"}</style>
    </div>
  );
}
