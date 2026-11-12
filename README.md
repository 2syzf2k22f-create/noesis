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

Phases 1 to 11 are built, plus a Dashboard and subpages.
- Dashboard (`/s/dashboard`): today's timetable (now and next), what's coming up, inbox, cards due, today's numbers, weekly score and patterns.
- Edit layout on any page: drag to reorder, resize, add from a catalogue of every box, save as a versioned custom layout, or reset.
- Chess: Stockfish 18 (WASM, GPL-3.0, `public/engine/`) runs in the browser for the analysis board, play-vs-engine, game review (brilliant to blunder, accuracy) and puzzles from your own mistakes. Also an opening trainer (25 validated lines) and Lichess puzzles by theme.
- Every space has an overview page and subpages (`/s/<space>/<sub>`, layouts in `src/ui/defaultSpecs.ts`). Apollo can redesign any of them.
- Home has only the orb and the message box. Pages and Styles fold out from the top-right corner. Each theme has its own UI skin (`src/theme/skins.css`).
- Apollo answers through the relay on your PC (`relay/README.md`) and acts only through the site tools. It works in modes: chat, tutor, language partner, flashcard maker and report writer.
- Every number comes from code: page bindings, `query_data`, weekly scores (`src/core/scores.ts`) and spaced repetition (`src/core/srsCore.ts`).
- Spaces:
  - School: flashcards, revision timer, tutor, notes to flashcards, homework, resources, website ingestion, opportunities.
  - Mind sports: chess.com sync, geography quiz, brain tests, poker, Codeforces.
  - Languages: vocab with spaced repetition, conversation practice, words of the day.
  - Library: books, a private journal, weekly reports.
  - Also Stats, Fitness, Nutrition and sleep, Projects, Inbox and Chats.
- The relay runs on a schedule: the weekly report on Mondays and the opportunities search on Sundays.
- Database: `supabase/migrations/0001-0003` (its own `noesis` schema). Not applied yet.
- Geography data: world-countries (ODbL); see `src/data/README.md`.
