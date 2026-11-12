// Built-in layouts for each space, in the same JSON spec Apollo writes. Apollo can replace any
// of them (update_page with the space id as slug); "revert_page" or deleting the page restores these.
import type { PageSpec } from "./spec";

const LANGS = ["Mandarin", "Spanish", "French", "English"];
const SUBJ = ["Maths", "Further Maths", "Physics", "Economics"];

export const DEFAULT_SPECS: Record<string, PageSpec> = {
  projects: {
    title: "Projects",
    blocks: [
      { type: "stat", title: "Active", span: 3, bind: { table: "projects", where: { status: "active" }, agg: { fn: "count" } } },
      { type: "stat", title: "Ideas", span: 3, bind: { table: "projects", where: { status: "idea" }, agg: { fn: "count" } } },
      { type: "stat", title: "Notes this week", span: 3, bind: { table: "project_notes", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "stat", title: "Done", span: 3, bind: { table: "projects", where: { status: "done" }, agg: { fn: "count" } } },
      { type: "kanban", title: "Board", span: 12, bind: { table: "projects", limit: 100 }, props: { statusField: "status", columns: ["idea", "active", "paused", "done"], primary: "name" } },
      { type: "form", title: "New project", span: 5, props: { table: "projects", defaults: { status: "idea" }, fields: [
        { name: "name", required: true }, { name: "status", type: "select", options: ["idea", "active", "paused", "done"] },
        { name: "link", label: "Link" }, { name: "summary", type: "textarea" },
      ] } },
      { type: "form", title: "Quick note", span: 7, props: { table: "project_notes", submit: "Save note", fields: [
        { name: "project", required: true }, { name: "text", type: "textarea", required: true },
      ] } },
      { type: "list", title: "Latest notes", span: 12, bind: { table: "project_notes", limit: 12 }, props: { primary: "text", secondary: ["project", "created_at"] } },
    ],
  },

  fitness: {
    title: "Fitness",
    subtitle: "Push · pull · legs",
    blocks: [
      { type: "stat", title: "Sets this week", span: 3, bind: { table: "sets", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "stat", title: "Volume this week", span: 3, props: { unit: "kg" }, bind: { table: "sets", days: 7, agg: { fn: "sum", field: "volume", by: "day" } } },
      { type: "stat", title: "Sleep, 7-day avg", span: 3, props: { unit: "h" }, bind: { table: "sleep_logs", days: 7, agg: { fn: "avg", field: "hours" } } },
      { type: "donut", title: "Split, last 28 days", span: 3, bind: { table: "sets", days: 28, agg: { fn: "count", by: { field: "routine" } } } },
      { type: "form", title: "Log a set", span: 12, props: { table: "sets", submit: "Log set", fields: [
        { name: "routine", type: "select", options: ["push", "pull", "legs", "other"] },
        { name: "exercise", required: true }, { name: "weight_kg", label: "Weight (kg)", type: "number" },
        { name: "reps", type: "number", required: true },
      ] } },
      { type: "bar", title: "Volume per day (kg)", span: 7, bind: { table: "sets", days: 14, agg: { fn: "sum", field: "volume", by: "day" } } },
      { type: "bar", title: "Best weight by exercise (kg)", span: 5, bind: { table: "sets", days: 90, agg: { fn: "max", field: "weight_kg", by: { field: "exercise" } } } },
      { type: "table", title: "Recent sets", span: 12, bind: { table: "sets", limit: 15 }, props: { columns: ["created_at", "routine", "exercise", "weight_kg", "reps"] } },
    ],
  },

  nutrition: {
    title: "Nutrition and sleep",
    blocks: [
      { type: "stat", title: "Calories, 24 h", span: 3, props: { unit: "kcal" }, bind: { table: "meals", days: 1, agg: { fn: "sum", field: "kcal" } } },
      { type: "stat", title: "Protein, 24 h", span: 3, props: { unit: "g" }, bind: { table: "meals", days: 1, agg: { fn: "sum", field: "protein_g" } } },
      { type: "stat", title: "Sleep last night", span: 3, props: { unit: "h" }, bind: { table: "sleep_logs", agg: { fn: "last", field: "hours" } } },
      { type: "stat", title: "Screen time, 7-day avg", span: 3, props: { unit: "min" }, bind: { table: "screentime_days", days: 7, agg: { fn: "avg", field: "minutes" } } },
      { type: "list", title: "Recipes · one tap to log", span: 6, bind: { table: "recipes", limit: 30, order: { col: "name", asc: true } },
        props: { primary: "name", secondary: ["kcal", "protein_g", "tags"], action: { label: "Log meal", op: "create", table: "meals", map: { name: "$name", kcal: "$kcal", protein_g: "$protein_g", recipe_id: "$id" } } } },
      { type: "list", title: "Meals, 24 h", span: 6, bind: { table: "meals", days: 1 }, props: { primary: "name", secondary: ["kcal", "protein_g"] } },
      { type: "form", title: "Log a meal", span: 6, props: { table: "meals", fields: [
        { name: "name", required: true }, { name: "kcal", type: "number" }, { name: "protein_g", label: "Protein (g)", type: "number" },
      ] } },
      { type: "form", title: "Log sleep", span: 6, props: { table: "sleep_logs", fields: [
        { name: "hours", type: "number", required: true }, { name: "quality", type: "select", options: ["1", "2", "3", "4", "5"] },
      ] } },
      { type: "line", title: "Sleep, 14 days (h)", span: 6, bind: { table: "sleep_logs", days: 14, agg: { fn: "avg", field: "hours", by: "day" } } },
      { type: "bar", title: "Calories, 14 days", span: 6, bind: { table: "meals", days: 14, agg: { fn: "sum", field: "kcal", by: "day" } } },
      { type: "form", title: "New recipe (saved ones are never regenerated)", span: 12, props: { table: "recipes", submit: "Save recipe", fields: [
        { name: "name", required: true }, { name: "servings", type: "number" }, { name: "kcal", label: "kcal / serving", type: "number" },
        { name: "protein_g", label: "Protein / serving (g)", type: "number" }, { name: "tags" },
        { name: "ingredients", type: "textarea" }, { name: "steps", type: "textarea" },
      ] } },
    ],
  },

  inbox: {
    title: "Inbox",
    blocks: [
      { type: "stat", title: "Unread", span: 3, bind: { table: "inbox_items", where: { read_at: null }, agg: { fn: "count" } } },
      { type: "list", title: "Unread", span: 12, bind: { table: "inbox_items", where: { read_at: null }, limit: 50 },
        props: { primary: "title", secondary: ["source", "due_at", "created_at"], action: { label: "Mark read", op: "update", data: { read_at: "$now" } } } },
      { type: "list", title: "All", span: 12, bind: { table: "inbox_items", limit: 20, order: { col: "read_at", asc: false } }, props: { primary: "title", secondary: ["source", "read_at"] } },
    ],
  },

  stats: {
    title: "Stats",
    subtitle: "Computed from your logs by fixed formulas. Missing data shows as no data.",
    blocks: [
      { type: "scores", title: "This week", span: 7 },
      { type: "heatmap", title: "Activity, 14 days", span: 5, bind: { table: "action_log", days: 14, agg: { fn: "count", by: "day" } } },
      { type: "stat", title: "Revision, 7 days", span: 3, props: { unit: "min" }, bind: { table: "study_sessions", days: 7, agg: { fn: "sum", field: "minutes", by: "day" } } },
      { type: "stat", title: "Sets, 7 days", span: 3, bind: { table: "sets", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "stat", title: "Sleep avg, 7 days", span: 3, props: { unit: "h" }, bind: { table: "sleep_logs", days: 7, agg: { fn: "avg", field: "hours" } } },
      { type: "stat", title: "Card reviews, 7 days", span: 3, bind: { table: "reviews", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "bar", title: "Revision minutes by subject, 28 days", span: 6, bind: { table: "study_sessions", days: 28, agg: { fn: "sum", field: "minutes", by: { field: "subject" } } } },
      { type: "donut", title: "Where your logging goes, 28 days", span: 6, bind: { table: "action_log", days: 28, agg: { fn: "count", by: { field: "table_name" } } } },
      { type: "list", title: "Opportunities", span: 6, bind: { table: "opportunities", limit: 8 }, props: { primary: "title", secondary: ["deadline", "subject"] } },
      { type: "stat", title: "Apollo tokens, 7 days", span: 6, bind: { table: "usage_log", days: 7, agg: { fn: "sum", field: "tokens_out", by: "day" } } },
    ],
  },

  school: {
    title: "School",
    subtitle: "Maths (OCR) · Further Maths (OCR) · Physics (AQA) · Economics (Edexcel)",
    blocks: [
      { type: "review", title: "Flashcards due", span: 7, props: { decks: SUBJ } },
      { type: "timer", title: "Revision timer", span: 5, props: { minutes: 25, choices: [15, 25, 45, 60], options: SUBJ, logTo: "study_sessions", label: "revision" } },
      { type: "stat", title: "Revision, 7 days", span: 3, props: { unit: "min" }, bind: { table: "study_sessions", days: 7, agg: { fn: "sum", field: "minutes", by: "day" } } },
      { type: "donut", title: "Time by subject, 28 days", span: 4, bind: { table: "study_sessions", days: 28, agg: { fn: "sum", field: "minutes", by: { field: "subject" } } } },
      { type: "heatmap", title: "Revision activity, 14 days", span: 5, bind: { table: "study_sessions", days: 14, agg: { fn: "sum", field: "minutes", by: "day" } } },
      { type: "ask", title: "Tutor", span: 7, props: { mode: "tutor", submit: "Teach me", template: "{subject}: {text}",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "text", label: "Topic or question (paste a question to work through it)", type: "textarea" }] } },
      { type: "ask", title: "Notes → flashcards", span: 5, props: { mode: "flashcards", submit: "Make cards", rows: 5, template: "Deck: {subject}. Topic: {topic}. Notes:\n{text}",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "topic", label: "Topic", type: "text" }, { name: "text", label: "Paste notes", type: "textarea" }] } },
      { type: "form", title: "Add a flashcard", span: 6, props: { table: "flashcards", submit: "Add card", fields: [
        { name: "deck", label: "Subject", type: "select", options: SUBJ }, { name: "topic" }, { name: "front", label: "Question", type: "textarea", required: true }, { name: "back", label: "Answer", type: "textarea", required: true },
      ] } },
      { type: "form", title: "Homework", span: 6, props: { table: "homework", defaults: { status: "to do" }, submit: "Add", fields: [
        { name: "title", required: true }, { name: "subject", type: "select", options: SUBJ }, { name: "due_at", label: "Due", type: "date" },
      ] } },
      { type: "list", title: "Homework to do", span: 6, bind: { table: "homework", where: { status: "to do" }, order: { col: "due_at", asc: true }, limit: 20 },
        props: { primary: "title", secondary: ["subject", "due_at"], action: { label: "Done", op: "update", data: { status: "done" } } } },
      { type: "list", title: "Resources", span: 6, bind: { table: "resource_links", limit: 20 }, props: { primary: "title", secondary: ["subject", "topic", "url"] } },
      { type: "form", title: "Save a link (YouTube, revision site…)", span: 6, props: { table: "resource_links", submit: "Save", fields: [
        { name: "title", required: true }, { name: "url", required: true }, { name: "subject", type: "select", options: SUBJ }, { name: "topic" },
      ] } },
      { type: "ask", title: "Learn from a revision website", span: 6, props: { submit: "Read & remember", template: "Ingest this revision page with ingest_url (subject {subject}, board {board}, topic {topic}): {url}",
        fields: [{ name: "url", label: "Page URL", type: "text" }, { name: "subject", type: "select", options: SUBJ }, { name: "board", type: "select", options: ["OCR", "AQA", "Edexcel"] }, { name: "topic", type: "text" }] } },
      { type: "list", title: "Opportunities (weekly search)", span: 12, bind: { table: "opportunities", limit: 10 }, props: { primary: "title", secondary: ["summary", "deadline", "url"] } },
    ],
  },

  mind: {
    title: "Mind sports",
    subtitle: "Chess · poker · geography · brain tests · programming",
    blocks: [
      { type: "sync", title: "Chess.com", span: 4, props: { service: "chess", label: "Sync chess.com games" } },
      { type: "stat", title: "Rapid rating", span: 4, bind: { table: "chess_ratings", where: { time_class: "rapid" }, agg: { fn: "last", field: "rating" } } },
      { type: "donut", title: "Results, 30 days", span: 4, bind: { table: "chess_games", days: 30, agg: { fn: "count", by: { field: "result" } } } },
      { type: "line", title: "Rating over games, 30 days", span: 8, bind: { table: "chess_games", days: 30, agg: { fn: "last", field: "rating", by: "day" } } },
      { type: "table", title: "Recent games", span: 4, bind: { table: "chess_games", limit: 8 }, props: { columns: ["result", "time_class", "opponent", "rating"] } },
      { type: "geo", title: "Geography", span: 7 },
      { type: "brain", title: "Brain tests", span: 5 },
      { type: "line", title: "Reaction time (ms), 30 days", span: 6, bind: { table: "brain_test_results", where: { test: "reaction" }, days: 30, agg: { fn: "min", field: "score", by: "day" } } },
      { type: "bar", title: "Best per test, 90 days", span: 6, bind: { table: "brain_test_results", days: 90, agg: { fn: "max", field: "score", by: { field: "test" } } } },
      { type: "form", title: "Poker session (home game / play money)", span: 6, props: { table: "poker_sessions", submit: "Log session", fields: [
        { name: "game", type: "select", options: ["Home game", "Play money"] }, { name: "buy_in", type: "number" }, { name: "cash_out", type: "number" }, { name: "notes", type: "textarea" },
      ] } },
      { type: "bar", title: "Poker P&L by week", span: 6, bind: { table: "poker_sessions", days: 60, agg: { fn: "sum", field: "profit", by: "week" } } },
      { type: "sync", title: "Codeforces", span: 6, props: { service: "codeforces", label: "Sync Codeforces" } },
      { type: "stat", title: "Codeforces rating", span: 6, bind: { table: "coding_stats", where: { platform: "codeforces" }, agg: { fn: "last", field: "rating" } } },
    ],
  },

  languages: {
    title: "Languages",
    subtitle: "Mandarin (HSK 1) · Spanish (A1) · French (refresh) · English vocabulary",
    blocks: [
      { type: "review", title: "Vocab due", span: 7, props: { decks: LANGS } },
      { type: "ask", title: "Conversation practice", span: 5, props: { mode: "conversation", submit: "Talk", template: "Language: {lang}. {text}",
        fields: [{ name: "lang", label: "Language", type: "select", options: ["Spanish", "French", "Mandarin"] }, { name: "text", label: "Say something (or tap the mic on home)", type: "textarea" }] } },
      { type: "ask", title: "Words of the day", span: 6, props: { mode: "flashcards", submit: "Give me today's words", template: "Make 5 useful {lang} words of the day at my level as flashcards (deck {lang}): word on the front; meaning, {extra} and one example sentence on the back. Skip words I already have.",
        fields: [{ name: "lang", label: "Language", type: "select", options: ["Mandarin", "Spanish", "French", "English"] }, { name: "extra", label: "Include", type: "select", options: ["pronunciation", "pinyin with tone marks", "gender and plural", "etymology"] }] } },
      { type: "form", title: "Add a word", span: 6, props: { table: "flashcards", submit: "Add", fields: [
        { name: "deck", label: "Language", type: "select", options: ["Mandarin", "Spanish", "French", "English"] }, { name: "front", label: "Word / phrase", required: true }, { name: "back", label: "Meaning (+ pinyin / gender)", required: true }, { name: "topic" },
      ] } },
      { type: "bar", title: "Reviews by language, 28 days", span: 6, bind: { table: "reviews", whereIn: { deck: LANGS }, days: 28, agg: { fn: "count", by: { field: "deck" } } } },
      { type: "bar", title: "Cards per deck", span: 6, bind: { table: "flashcards", whereIn: { deck: LANGS }, agg: { fn: "count", by: { field: "deck" } } } },
    ],
  },

  library: {
    title: "Library",
    subtitle: "Books · journal (private) · weekly reports",
    blocks: [
      { type: "kanban", title: "Books", span: 12, bind: { table: "books", limit: 60 }, props: { statusField: "status", columns: ["to read", "reading", "finished"], primary: "title" } },
      { type: "form", title: "Add a book", span: 6, props: { table: "books", defaults: { status: "to read" }, submit: "Add", fields: [
        { name: "title", required: true }, { name: "author" }, { name: "pages", type: "number" },
      ] } },
      { type: "form", title: "Log reading", span: 6, props: { table: "reading_logs", submit: "Log", fields: [
        { name: "book" }, { name: "pages", type: "number", required: true },
      ] } },
      { type: "bar", title: "Pages read, 14 days", span: 6, bind: { table: "reading_logs", days: 14, agg: { fn: "sum", field: "pages", by: "day" } } },
      { type: "stat", title: "Pages this week", span: 6, bind: { table: "reading_logs", days: 7, agg: { fn: "sum", field: "pages", by: "day" } } },
      { type: "form", title: "Journal · private unless you tick shareable", span: 12, props: { table: "journal_entries", submit: "Save entry", fields: [
        { name: "text", label: "Entry", type: "textarea", required: true }, { name: "mood", type: "select", options: ["great", "good", "ok", "low", "bad"] }, { name: "shareable", label: "Apollo may read this", type: "checkbox" },
      ] } },
      { type: "list", title: "Journal", span: 6, bind: { table: "journal_entries", limit: 10 }, props: { primary: "text", secondary: ["mood", "created_at"] } },
      { type: "list", title: "Weekly reports", span: 6, bind: { table: "weekly_reports", limit: 12, order: { col: "week", asc: false } }, props: { primary: "title", secondary: ["grade", "overall"] } },
      { type: "list", title: "Latest report", span: 12, bind: { table: "weekly_reports", limit: 1, order: { col: "week", asc: false } }, props: { primary: "commentary", secondary: ["grade"] } },
    ],
  },
};
