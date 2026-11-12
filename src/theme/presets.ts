// Design tokens. One preset = CSS variables (UI) + an orb theme object (three.js).
// Apollo creates/edits presets by editing these tokens — nothing else is hard-coded.

export type RGB = string; // hex

export type OrbTheme = {
  bg: RGB; // must equal css --bg so the canvas blends into the page
  bloom: number; // 0 disables the bloom pass
  blending: "additive" | "normal";
  shell: {
    base: RGB;
    rimA: RGB;
    rimB: RGB;
    iri: number; // 0..1 how much thin-film rainbow replaces the rim colours
    coreAlpha: number; // opacity at the centre of the sphere (glass = low)
    filmMix: number;
    fresPow: number;
    disp: number; // idle surface displacement
    spec: number;
    shade: number;
    scan: number; // 0..1 scanline cut-out (Signal)
  };
  ribbon: { on: number; a: RGB; b: RGB };
  ring: { on: number; a: RGB; b: RGB };
  wire: { base: number; color: RGB };
  core: { color: RGB; intensity: number; size: number };
};

export type ThemePreset = {
  id: string;
  name: string;
  note: string;
  scheme: "dark" | "light";
  frame: "rounded" | "chamfer" | "square";
  nav: "rail" | "top";
  swatch: [RGB, RGB, RGB];
  css: Record<string, string>;
  orb: OrbTheme;
};

const base = {
  "--good": "#4ade80",
  "--danger": "#f87171",
  "--display-transform": "none",
  "--display-tracking": "-0.03em",
  "--display-weight": "500",
  "--label-transform": "uppercase",
  "--label-tracking": "0.14em",
  "--border-w": "1px",
};

export const PRESETS: ThemePreset[] = [
  {
    id: "midnight",
    name: "Midnight Glass",
    note: "Navy glass, cyan to violet",
    scheme: "dark",
    frame: "rounded",
    nav: "rail",
    swatch: ["#070a1c", "#3fe0ff", "#8b5cff"],
    css: {
      ...base,
      "--bg": "#070a1c",
      "--bg-glow": "rgba(88, 101, 255, 0.10)",
      "--surface": "rgba(120, 140, 255, 0.06)",
      "--surface-2": "rgba(120, 140, 255, 0.11)",
      "--border": "rgba(150, 170, 255, 0.16)",
      "--text": "#eef1ff",
      "--text-dim": "#8d95bd",
      "--accent": "#3fe0ff",
      "--accent-2": "#8b5cff",
      "--on-accent": "#04061a",
      "--radius": "18px",
      "--radius-sm": "10px",
      "--blur": "18px",
      "--shadow": "0 20px 60px rgba(0, 0, 0, 0.45)",
      "--glow": "0 0 24px rgba(63, 224, 255, 0.35)",
      "--font-display": "var(--f-grotesk)",
      "--font-body": "var(--f-inter)",
      "--font-mono": "var(--f-mono)",
      "--chart-1": "#3fe0ff",
      "--chart-2": "#8b5cff",
      "--chart-3": "#ff5fd2",
      "--chart-4": "#5b8cff",
    },
    orb: {
      bg: "#070a1c",
      bloom: 0.38,
      blending: "additive",
      shell: {
        base: "#0b1030", rimA: "#7fd8ff", rimB: "#a070ff", iri: 0.15,
        coreAlpha: 0.02, filmMix: 1.0, fresPow: 3.2, disp: 0.03, spec: 0.35, shade: 0, scan: 0,
      },
      ribbon: { on: 1, a: "#35e6ff", b: "#8a4dff" },
      ring: { on: 0.45, a: "#2fd6d6", b: "#7a55ff" },
      wire: { base: 0, color: "#7fd8ff" },
      core: { color: "#5b6cff", intensity: 0.03, size: 1.0 },
    },
  },
  {
    id: "iridescent",
    name: "Iridescent",
    note: "Light editorial, pearl orb",
    scheme: "light",
    frame: "rounded",
    nav: "top",
    swatch: ["#f1efea", "#111111", "#c58bff"],
    css: {
      ...base,
      "--bg": "#f1efea",
      "--bg-glow": "rgba(197, 139, 255, 0.10)",
      "--surface": "rgba(255, 255, 255, 0.62)",
      "--surface-2": "rgba(255, 255, 255, 0.9)",
      "--border": "rgba(17, 17, 17, 0.10)",
      "--text": "#111111",
      "--text-dim": "#6d6a64",
      "--accent": "#111111",
      "--accent-2": "#9b6bff",
      "--on-accent": "#f1efea",
      "--good": "#15803d",
      "--danger": "#c2410c",
      "--radius": "22px",
      "--radius-sm": "12px",
      "--blur": "14px",
      "--shadow": "0 18px 50px rgba(40, 30, 60, 0.10)",
      "--glow": "none",
      "--font-display": "var(--f-wide)",
      "--font-body": "var(--f-inter)",
      "--font-mono": "var(--f-mono)",
      "--display-weight": "700",
      "--display-tracking": "-0.05em",
      "--chart-1": "#111111",
      "--chart-2": "#9b6bff",
      "--chart-3": "#ff6fb5",
      "--chart-4": "#28b8c8",
    },
    orb: {
      bg: "#f1efea",
      bloom: 0,
      blending: "normal",
      shell: {
        base: "#f4f2fa", rimA: "#39d5f0", rimB: "#ff4fc8", iri: 0.8,
        coreAlpha: 1, filmMix: 1.0, fresPow: 2.1, disp: 0.085, spec: 0.22, shade: 0.14, scan: 0,
      },
      ribbon: { on: 0, a: "#39d5f0", b: "#ff4fc8" },
      ring: { on: 0.5, a: "#32bcd6", b: "#b46bff" },
      wire: { base: 0, color: "#111111" },
      core: { color: "#ffffff", intensity: 0, size: 1.0 },
    },
  },
  {
    id: "ember",
    name: "Ember HUD",
    note: "Technical HUD, ember orange",
    scheme: "dark",
    frame: "chamfer",
    nav: "rail",
    swatch: ["#0d0504", "#ff5a2a", "#ffb37a"],
    css: {
      ...base,
      "--bg": "#0d0504",
      "--bg-glow": "rgba(255, 90, 42, 0.10)",
      "--surface": "rgba(255, 110, 60, 0.05)",
      "--surface-2": "rgba(255, 110, 60, 0.10)",
      "--border": "rgba(255, 120, 70, 0.28)",
      "--text": "#ffe9df",
      "--text-dim": "#b07a66",
      "--accent": "#ff5a2a",
      "--accent-2": "#ffb37a",
      "--on-accent": "#140503",
      "--radius": "2px",
      "--radius-sm": "2px",
      "--blur": "6px",
      "--shadow": "none",
      "--glow": "0 0 18px rgba(255, 90, 42, 0.45)",
      "--font-display": "var(--f-mono)",
      "--font-body": "var(--f-mono)",
      "--font-mono": "var(--f-mono)",
      "--display-weight": "300",
      "--display-tracking": "-0.04em",
      "--chart-1": "#ff5a2a",
      "--chart-2": "#ffb37a",
      "--chart-3": "#ff2e4d",
      "--chart-4": "#ffd9a0",
    },
    orb: {
      bg: "#0d0504",
      bloom: 0.4,
      blending: "additive",
      shell: {
        base: "#3a0d04", rimA: "#ffb98a", rimB: "#ff5a2a", iri: 0,
        coreAlpha: 0.1, filmMix: 1.0, fresPow: 2.2, disp: 0.02, spec: 0.2, shade: 0, scan: 0,
      },
      ribbon: { on: 0.35, a: "#ff8a4a", b: "#ff3b1f" },
      ring: { on: 0.2, a: "#ff7a3a", b: "#ffb37a" },
      wire: { base: 0.8, color: "#ffc9a8" },
      core: { color: "#ff4416", intensity: 0.55, size: 1.0 },
    },
  },
  {
    id: "mono",
    name: "Mono",
    note: "Black and white line art",
    scheme: "dark",
    frame: "rounded",
    nav: "top",
    swatch: ["#000000", "#ffffff", "#7a7a7a"],
    css: {
      ...base,
      "--bg": "#000000",
      "--bg-glow": "rgba(255, 255, 255, 0.05)",
      "--surface": "rgba(255, 255, 255, 0.04)",
      "--surface-2": "rgba(255, 255, 255, 0.09)",
      "--border": "rgba(255, 255, 255, 0.14)",
      "--text": "#ffffff",
      "--text-dim": "#8a8a8a",
      "--accent": "#ffffff",
      "--accent-2": "#bdbdbd",
      "--on-accent": "#000000",
      "--radius": "999px",
      "--radius-sm": "14px",
      "--blur": "10px",
      "--shadow": "none",
      "--glow": "0 0 22px rgba(255, 255, 255, 0.28)",
      "--font-display": "var(--f-inter)",
      "--font-body": "var(--f-inter)",
      "--font-mono": "var(--f-mono)",
      "--display-weight": "600",
      "--display-tracking": "-0.045em",
      "--chart-1": "#ffffff",
      "--chart-2": "#b0b0b0",
      "--chart-3": "#787878",
      "--chart-4": "#4a4a4a",
    },
    orb: {
      bg: "#000000",
      bloom: 0.7,
      blending: "additive",
      shell: {
        base: "#000000", rimA: "#ffffff", rimB: "#cfcfcf", iri: 0,
        coreAlpha: 0.0, filmMix: 0.8, fresPow: 3.4, disp: 0.03, spec: 0.25, shade: 0, scan: 0,
      },
      ribbon: { on: 0.8, a: "#ffffff", b: "#9a9a9a" },
      ring: { on: 0.7, a: "#ffffff", b: "#8c8c8c" },
      wire: { base: 0, color: "#ffffff" },
      core: { color: "#ffffff", intensity: 0.05, size: 1.0 },
    },
  },
  {
    id: "signal",
    name: "Signal",
    note: "Brutalist terminal, red",
    scheme: "dark",
    frame: "square",
    nav: "top",
    swatch: ["#000000", "#ffffff", "#ff1a1a"],
    css: {
      ...base,
      "--bg": "#000000",
      "--bg-glow": "rgba(0, 0, 0, 0)",
      "--surface": "rgba(0, 0, 0, 0.6)",
      "--surface-2": "rgba(255, 255, 255, 0.08)",
      "--border": "#ffffff",
      "--text": "#ffffff",
      "--text-dim": "#a8a8a8",
      "--accent": "#ff1a1a",
      "--accent-2": "#ffffff",
      "--on-accent": "#000000",
      "--good": "#ffffff",
      "--danger": "#ff1a1a",
      "--radius": "0px",
      "--radius-sm": "0px",
      "--blur": "0px",
      "--shadow": "none",
      "--glow": "none",
      "--font-display": "var(--f-pixel)",
      "--font-body": "var(--f-mono)",
      "--font-mono": "var(--f-mono)",
      "--display-weight": "400",
      "--display-tracking": "0.02em",
      "--display-transform": "uppercase",
      "--chart-1": "#ff1a1a",
      "--chart-2": "#ffffff",
      "--chart-3": "#8a8a8a",
      "--chart-4": "#ff7a7a",
    },
    orb: {
      bg: "#000000",
      bloom: 0,
      blending: "additive",
      shell: {
        base: "#ff1a1a", rimA: "#ff1a1a", rimB: "#ff5a5a", iri: 0,
        coreAlpha: 0.85, filmMix: 0.6, fresPow: 1.2, disp: 0.045, spec: 0, shade: 0.5, scan: 1,
      },
      ribbon: { on: 0, a: "#ff1a1a", b: "#ffffff" },
      ring: { on: 0.3, a: "#ffffff", b: "#ffffff" },
      wire: { base: 0.3, color: "#ffffff" },
      core: { color: "#ff1a1a", intensity: 0, size: 1.0 },
    },
  },
];

export const DEFAULT_THEME = "midnight";
export const THEME_KEY = "noesis.theme";

export function getPreset(id: string | null | undefined): ThemePreset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}

/** All presets as CSS, keyed by html[data-theme]. Rendered once in the layout. */
export function presetsToCss(presets: ThemePreset[] = PRESETS): string {
  return presets
    .map((p) => {
      const vars = Object.entries(p.css)
        .map(([k, v]) => `${k}:${v};`)
        .join("");
      const sel =
        p.id === DEFAULT_THEME
          ? `:root,html[data-theme="${p.id}"]`
          : `html[data-theme="${p.id}"]`;
      return `${sel}{color-scheme:${p.scheme};${vars}}`;
    })
    .join("\n");
}
