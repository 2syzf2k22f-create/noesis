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
- `src/app/api/` — server routes (ask, jobs, status, chats, undo).
- `relay/` — runs on the home PC: job loop, Claude Code backend, MCP tool server.
- `supabase/migrations/` — database schema.
- `public/sw.js`, `src/app/manifest.ts` — PWA.

## Status

Phases 1 to 4 are built.
- Home has only the orb and the message box. Everything else opens on demand (Ctrl/Cmd+K, or type e.g. "inbox panel", "mono", "school").
- Apollo answers through the relay on your PC (`relay/README.md`), acts only through the site tools (`src/core/tools.ts`), and every change can be undone.
- Database: `supabase/migrations/0001_core.sql` (own `noesis` schema). It hasn't been applied yet.
