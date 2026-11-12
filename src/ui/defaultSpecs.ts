// Built-in layouts for each space, in the same JSON spec Apollo writes. Apollo can replace any
// of them (update_page with the space id as slug); "revert_page" or deleting the page restores these.
import type { PageSpec } from "./spec";

const later = (what: string): PageSpec["blocks"] => [
  { type: "text", span: 8, props: { text: `This space arrives in a later phase: ${what}.\n\nYou can still ask Apollo to build a page for it now.` } },
];

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
    subtitle: "Computed from your logs. Missing data shows as no data.",
    blocks: [
      { type: "stat", title: "Sets, 7 days", span: 3, bind: { table: "sets", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "stat", title: "Sleep avg, 7 days", span: 3, props: { unit: "h" }, bind: { table: "sleep_logs", days: 7, agg: { fn: "avg", field: "hours" } } },
      { type: "stat", title: "Meals logged, 7 days", span: 3, bind: { table: "meals", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "stat", title: "Apollo tokens, 7 days", span: 3, bind: { table: "usage_log", days: 7, agg: { fn: "sum", field: "tokens_out", by: "day" } } },
      { type: "heatmap", title: "Activity, 14 days", span: 6, bind: { table: "action_log", days: 14, agg: { fn: "count", by: "day" } } },
      { type: "donut", title: "Where your logging goes, 28 days", span: 6, bind: { table: "action_log", days: 28, agg: { fn: "count", by: { field: "table_name" } } } },
      { type: "text", span: 12, props: { text: "Weekly scores per area and the weekly report arrive in phase 9." } },
    ],
  },

  school: { title: "School", blocks: later("revision hub, flashcards, timer, tutor, OneNote and opportunities (phase 8)") },
  mind: { title: "Mind sports", blocks: later("chess with Stockfish, poker, geography, brain tests, memory and programming (phase 10)") },
  languages: { title: "Languages", blocks: later("Mandarin, Spanish, French and English with spaced repetition (phase 10)") },
  library: { title: "Library", blocks: later("books, a private journal, files and weekly reports (phase 11)") },
};
