# NOESIS

Personal site run by Apollo. Spec: `../apollo-spec/CLAUDE.md`.

```bash
npm install
npm run dev
```

## Where things are

- `src/theme/presets.ts` — design tokens. Each preset holds the CSS variables and the orb's three.js theme.
- `src/orb/` — the Apollo orb: shaders, the component, and the audio level source.
- `src/components/Home.tsx` — home screen.
- `supabase/migrations/` — database schema. Not applied to any project yet.
- `public/sw.js`, `src/app/manifest.ts` — PWA.

## Status

Phase 1 (foundation) and phase 2 (orb) are built. Supabase project, auth and the Netlify deploy are waiting on the owner's go-ahead.
