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
- `src/core/` — storage, site tools, action log and undo, model routing, Apollo's prompt.
- `src/app/api/` — server routes (ask, jobs, status, chats, undo, data, records, pages, widgets, themes).
- `src/ui/` — page specs, component library, default space layouts.
- `src/voice/` — speech recognition, wake word, speech synthesis.
- `relay/` — runs on the home PC: job loop, Claude Code backend, MCP tool server.
- `supabase/migrations/` — database schema.
- `public/sw.js`, `src/app/manifest.ts` — PWA.

## Status

Phases 1 to 7 are built.
- Home has only the orb and the message box. Pages and Styles fold out from the top-right corner.
- Apollo answers through the relay on your PC (`relay/README.md`). It acts only through the site tools in `src/core/tools.ts`, and every change can be undone.
- Generated UI (`src/ui/`): pages and widgets are JSON specs drawn by the site's component library. Numbers come from bindings computed in code (`src/core/query.ts`). Custom components run in a sandboxed iframe.
- Voice: the browser handles speech to text, spoken replies and the wake word. Hold the mic button, or hold Space, to talk.
- Spaces with real layouts: Projects, Fitness, Nutrition and sleep, Inbox and Stats.
- Database: `supabase/migrations/` (its own `noesis` schema). Not applied yet.
