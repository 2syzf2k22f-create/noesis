// The spaces and their thin-line icons (24x24, 1.5 stroke). Pure data: Apollo can reorder it later.

export type Sub = { id: string; name: string; blurb: string };
export type Space = { id: string; name: string; icon: string; blurb: string; subs?: Sub[] };

export const ICONS = {
  home: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z",
  school: "M4 6.5c2.5-1 5.5-1 8 .5c2.5-1.5 5.5-1.5 8-.5v11c-2.5-1-5.5-1-8 .5c-2.5-1.5-5.5-1.5-8-.5z M12 7v11",
  fitness: "M6.5 12h11 M6.5 7.5v9 M17.5 7.5v9 M3.5 10v4 M20.5 10v4",
  nutrition: "M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z",
  projects: "M4 8l8-4l8 4l-8 4z M4 12l8 4l8-4 M4 16l8 4l8-4",
  mind: "M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z M12 8.5v7 M8.5 12h7",
  languages: "M4 5.5h9 M8.5 3.5v2 M5.5 5.5c.5 4 3 6.5 6.5 8 M11.5 5.5c-.5 3.5-3 6.5-7 8 M13 20l4-9l4 9 M14.5 17h5",
  library: "M5 4v16 M9 4v16 M13 5l5 14.5 M3 20h18",
  uni: "M2 9l10-5 10 5-10 5z M6 11v5c2 2 10 2 12 0v-5 M22 9v6",
  stats: "M5 20V11 M10 20V4 M15 20v-7 M20 20V8",
  inbox: "M3 13l3-8h12l3 8v6H3z M3 13h5l1.5 3h5L16 13h5",
  chats: "M4 5h16v11H10l-5 4v-4H4z",
  style: "M12 3a9 9 0 1 0 0 18z M12 3a9 9 0 0 1 0 18 M12 7.5a4.5 4.5 0 0 1 0 9",
  panel: "M4 5h16v14H4z M4 9h16",
  orb: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M5 12c2.5-4 4.5-4 7 0s4.5 4 7 0",
  pin: "M9 4h6l-1 6l3 3H7l3-3z M12 13v7",
  close: "M6 6l12 12 M18 6L6 18",
  ask: "M5 12h13 M13 7l5 5l-5 5",
  menu: "M4 7h16 M4 12h16 M4 17h10",
  grid: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h6v6h-6z",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 7v5l3 2",
  file: "M6 3h8l4 4v14H6z M14 3v4h4",
  undo: "M9 14L4 9l5-5 M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
} as const;

export type IconName = keyof typeof ICONS;

export const SPACES: Space[] = [
  { id: "dashboard", name: "Dashboard", icon: "grid", blurb: "Today: timetable, inbox, what's due, your numbers" },
  { id: "school", name: "School", icon: "school", blurb: "Revision hub, tutor, notes, homework, timetable", subs: [
    { id: "flashcards", name: "Flashcards", blurb: "Spaced repetition by subject" },
    { id: "revise", name: "Revise", blurb: "Timer and revision stats" },
    { id: "planner", name: "Planner", blurb: "Exam countdown and a day-by-day revision plan" },
    { id: "tests", name: "Tests", blurb: "School tests by topic, mistake log and stats" },
    { id: "questions", name: "Questions", blurb: "Question bank: past-paper and exam-style questions, practice and tests" },
    { id: "papers", name: "Past papers", blurb: "Marks by paper and topic, weak-topic finder" },
    { id: "tutor", name: "Tutor", blurb: "Step-by-step help aimed at full marks" },
    { id: "notes", name: "Notes", blurb: "Lesson and topic notes, notes to flashcards, websites" },
    { id: "homework", name: "Homework", blurb: "What's set and when it's due" },
    { id: "timetable", name: "Timetable", blurb: "Lessons, exams and deadlines" },
    { id: "resources", name: "Resources", blurb: "Links and videos per topic" },
    { id: "opportunities", name: "Opportunities", blurb: "Weekly extracurricular search" },
    { id: "subjects", name: "Subjects", blurb: "Boards, options and spec topics" },
  ] },
  { id: "fitness", name: "Fitness", icon: "fitness", blurb: "Training, progress, recovery", subs: [
    { id: "plan", name: "Workout plan", blurb: "A plan built around you" },
    { id: "log", name: "Log", blurb: "Log sets as you train" },
    { id: "progress", name: "Progress", blurb: "Lifts, records and volume" },
    { id: "routines", name: "Routines", blurb: "Push, pull, legs templates" },
    { id: "recovery", name: "Recovery", blurb: "Soreness, energy and sleep" },
  ] },
  { id: "nutrition", name: "Nutrition and sleep", icon: "nutrition", blurb: "Meals, recipes, sleep, screen time", subs: [
    { id: "mealplan", name: "Meal plan", blurb: "Plans built around you, recipes you can rate and save" },
    { id: "meals", name: "Meals", blurb: "One-tap logging" },
    { id: "recipes", name: "Recipes", blurb: "Saved recipes, never regenerated" },
    { id: "sleep", name: "Sleep", blurb: "Hours and quality" },
    { id: "screentime", name: "Screen time", blurb: "Daily phone use" },
  ] },
  { id: "projects", name: "Projects", icon: "projects", blurb: "Status, notes, links, files, a chat per project", subs: [
    { id: "notes", name: "Notes", blurb: "Notes per project" },
    { id: "links", name: "Links", blurb: "Links per project" },
    { id: "chat", name: "Chat", blurb: "A chat per project, with its context" },
    { id: "build", name: "Build NOESIS", blurb: "Change the site's own code, with preview and rollback" },
  ] },
  { id: "mind", name: "Mind sports", icon: "mind", blurb: "Chess, poker, geography, brain tests, memory, programming", subs: [
    { id: "chess", name: "Chess", blurb: "chess.com sync, ratings and results" },
    { id: "analysis", name: "Play & analyse", blurb: "Play Stockfish at any Elo, from any position; analyse with the engine" },
    { id: "openings", name: "Openings", blurb: "Drill opening theory move by move" },
    { id: "puzzles", name: "Puzzles", blurb: "Tactics from Lichess and from your own games" },
    { id: "review", name: "Game review", blurb: "Brilliant to blunder, move by move" },
    { id: "poker", name: "Poker", blurb: "Practice table vs human-like bots, stats, home games" },
    { id: "geography", name: "Geography", blurb: "Flags, capitals, sizes" },
    { id: "brain", name: "Brain tests", blurb: "Reaction, memory, typing and more" },
    { id: "memory", name: "Memory sports", blurb: "Numbers, cards, memory palaces" },
    { id: "coding", name: "Programming", blurb: "Codeforces and Advent of Code" },
  ] },
  { id: "languages", name: "Languages", icon: "languages", blurb: "Mandarin, Spanish, French, English", subs: [
    { id: "mandarin", name: "Mandarin", blurb: "Characters, tones, HSK 1" },
    { id: "spanish", name: "Spanish", blurb: "From A1" },
    { id: "french", name: "French", blurb: "Refresh, then beyond" },
    { id: "english", name: "English", blurb: "Vocabulary" },
    { id: "conversation", name: "Conversation", blurb: "Practise with Apollo" },
  ] },
  { id: "library", name: "Library", icon: "library", blurb: "Books, journal, files, weekly reports", subs: [
    { id: "books", name: "Books", blurb: "Reading list and log" },
    { id: "knowledge", name: "Knowledge", blurb: "Websites, files and text Apollo learns from" },
    { id: "journal", name: "Journal", blurb: "Private by default" },
    { id: "files", name: "Files", blurb: "Things made with Apollo or Claude" },
    { id: "reports", name: "Reports", blurb: "Weekly reports" },
  ] },
  { id: "uni", name: "University", icon: "uni", blurb: "Courses, universities, stats, offers vs your grades", subs: [
    { id: "explore", name: "Explore", blurb: "Courses and universities with every stat, compare, map" },
    { id: "opportunities", name: "Opportunities", blurb: "Open days, summer schools, taster days, schemes" },
  ] },
  { id: "stats", name: "Stats", icon: "stats", blurb: "Scores computed from your logs", subs: [
    { id: "scores", name: "Scores", blurb: "Weekly scores and history" },
    { id: "deep", name: "Deep dives", blurb: "In-depth stats for every area" },
    { id: "usage", name: "Apollo usage", blurb: "Tokens and plan usage" },
  ] },
  { id: "inbox", name: "Inbox", icon: "inbox", blurb: "Teams, OneNote, deadlines, reports" },
  { id: "chats", name: "Chats", icon: "chats", blurb: "Saved conversations with Apollo" },
];

/** Stored-page slug for a space or subpage: "school" or "school--flashcards". */
export const pageSlug = (space: string, sub?: string) => (sub ? `${space}--${sub}` : space);
export const pageHref = (space: string, sub?: string) => (sub ? `/s/${space}/${sub}` : `/s/${space}`);
export const ALL_PAGE_IDS = SPACES.flatMap((s) => [s.id, ...(s.subs ?? []).map((x) => `${s.id}/${x.id}`)]);

export const getSpace = (id: string) => SPACES.find((s) => s.id === id);
export const getSub = (space: string, sub: string) => getSpace(space)?.subs?.find((x) => x.id === sub);
