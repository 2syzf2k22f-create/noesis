# NOESIS

Personal site run by Apollo. Spec: `../apollo-spec/CLAUDE.md`.

```bash
npm install
npm run dev
```

## Where things are

- `src/theme/presets.ts` — design tokens. Each preset holds the CSS variables and the orb's three.js theme.
- `src/orb/` — the Apollo orb: shaders, the component, and the audio level source.
- `src/shell/` — the persistent shell: docking orb, panels, command palette, nav, command bar.
- `supabase/migrations/` — database schema. Not applied to any project yet.
- `public/sw.js`, `src/app/manifest.ts` — PWA.

## Status

Phases 1 to 3 are built (foundation, orb, home and layout). Home is only the orb and the message box; everything else opens on demand (Ctrl/Cmd+K, or type e.g. "inbox panel", "mono", "school").
