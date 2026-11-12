// Built-in layouts for the dashboard, every space overview and every subpage, in the same JSON
// spec Apollo writes. Keys are page slugs ("school", "school--flashcards"). Apollo can replace any
// of them (update_page with that slug); revert_page or deleting the page restores these.
import type { Block, PageSpec } from "./spec";

const SUBJ = ["Maths", "Further Maths", "Physics", "Economics"];
const LANGS = ["Mandarin", "Spanish", "French", "English"];
const DAYS = ["1 Mon", "2 Tue", "3 Wed", "4 Thu", "5 Fri", "6 Sat", "7 Sun"];
const PROJECT = { table: "projects", field: "name" };

// shared bindings
const dueCards = (decks?: string[]) => ({ table: "flashcards", due: { field: "due_at", includeNull: true }, ...(decks ? { whereIn: { deck: decks } } : {}), agg: { fn: "count" as const } });
const revision7 = { table: "study_sessions", days: 7, agg: { fn: "sum" as const, field: "minutes", by: "day" as const } };
const hwOpen = { table: "homework", where: { status: "to do" }, agg: { fn: "count" as const } };
const tile = (label: string, href: string, bind?: Block["bind"], caption?: string, unit?: string, span = 3): Block => ({ type: "tile", span, bind, props: { label, href, caption, unit } });

export const DEFAULT_SPECS: Record<string, PageSpec> = {
  /* ======================= overall dashboard ======================= */
  dashboard: {
    title: "Dashboard",
    subtitle: "Today at a glance",
    blocks: [
      { type: "timetable", title: "Today", span: 5, bind: { table: "timetable", limit: 200 } },
      { type: "agenda", title: "Coming up", span: 4, props: { days: 14, limit: 8 } },
      { type: "inbox", title: "Inbox", span: 3, bind: { table: "inbox_items", where: { read_at: null }, limit: 6 } },
      tile("Cards due", "/s/school/flashcards", dueCards(SUBJ), "school flashcards"),
      tile("Homework", "/s/school/homework", hwOpen, "to do"),
      tile("Revision, 7 days", "/s/school/revise", revision7, "minutes", "min"),
      tile("Vocab due", "/s/languages", dueCards(LANGS), "across languages"),
      tile("Sleep last night", "/s/nutrition/sleep", { table: "sleep_logs", agg: { fn: "last", field: "hours" } }, "hours", "h"),
      tile("Calories, 24 h", "/s/nutrition/meals", { table: "meals", days: 1, agg: { fn: "sum", field: "kcal" } }, "kcal"),
      tile("Sets this week", "/s/fitness/log", { table: "sets", days: 7, agg: { fn: "count" } }, "logged"),
      tile("Unread", "/s/inbox", { table: "inbox_items", where: { read_at: null }, agg: { fn: "count" } }, "inbox items"),
      { type: "countdown", title: "Exams", span: 3, props: { kind: "exam" }, bind: { table: "events", upcoming: { field: "at", days: 365 }, limit: 10 } },
      { type: "list", title: "Today's plan", span: 5, bind: { table: "plan_items", where: { done: false }, upcoming: { field: "date", days: 1 }, limit: 10 },
        props: { primary: "topic", secondary: ["subject", "minutes"], action: { label: "Done", op: "update", data: { done: true } } } },
      { type: "form", title: "Check-in", span: 4, props: { table: "checkins", submit: "Check in", fields: [
        { name: "kind", type: "select", options: ["morning", "evening"] }, { name: "energy", label: "Energy 1-5", type: "select", options: ["1", "2", "3", "4", "5"] },
        { name: "mood", type: "select", options: ["great", "good", "ok", "low", "bad"] }, { name: "note", label: "Intention (morning) / win of the day (evening)", type: "textarea" },
      ] } },
      { type: "streaks", title: "Streaks", span: 4 },
      { type: "scores", title: "This week", span: 5, props: { report: false } },
      { type: "insights", title: "Patterns", span: 3 },
    ],
  },

  /* ======================= school ======================= */
  school: {
    title: "School",
    subtitle: "Maths (OCR) · Further Maths (OCR) · Physics (AQA) · Economics (Edexcel)",
    blocks: [
      tile("Flashcards", "/s/school/flashcards", dueCards(SUBJ), "due now"),
      tile("Revise", "/s/school/revise", revision7, "minutes this week", "min"),
      tile("Homework", "/s/school/homework", hwOpen, "to do"),
      tile("Notes", "/s/school/notes", { table: "notes", agg: { fn: "count" } }, "saved notes"),
      { type: "timetable", title: "Today", span: 4, bind: { table: "timetable", limit: 200 } },
      { type: "agenda", title: "Due soon", span: 4, props: { days: 14, limit: 6 } },
      { type: "donut", title: "Revision by subject, 28 days", span: 4, bind: { table: "study_sessions", days: 28, agg: { fn: "sum", field: "minutes", by: { field: "subject" } } } },
      { type: "countdown", title: "Exams", span: 4, props: { kind: "exam" }, bind: { table: "events", upcoming: { field: "at", days: 365 }, limit: 10 } },
      tile("Planner", "/s/school/planner", { table: "plan_items", where: { done: false }, upcoming: { field: "date", days: 1 }, agg: { fn: "count" } }, "sessions left today", undefined, 4),
      tile("Past papers", "/s/school/papers", { table: "past_papers", days: 90, agg: { fn: "avg", field: "pct" } }, "average %, 90 days", "%", 4),
      tile("Tutor", "/s/school/tutor", undefined, "step-by-step help", undefined, 3),
      tile("Timetable", "/s/school/timetable", { table: "events", upcoming: { field: "at", days: 30 }, agg: { fn: "count" } }, "exams & events in 30 days", undefined, 3),
      tile("Resources", "/s/school/resources", { table: "resource_links", agg: { fn: "count" } }, "saved links", undefined, 3),
      tile("Opportunities", "/s/school/opportunities", { table: "opportunities", agg: { fn: "count" } }, "found so far", undefined, 3),
    ],
  },
  "school--flashcards": {
    title: "Flashcards",
    blocks: [
      { type: "review", title: "Review", span: 8, props: { decks: SUBJ } },
      { type: "stat", title: "Due now", span: 4, bind: dueCards(SUBJ) },
      { type: "form", title: "Add a card", span: 6, props: { table: "flashcards", submit: "Add card", fields: [
        { name: "deck", label: "Subject", type: "select", options: SUBJ }, { name: "topic" },
        { name: "front", label: "Question", type: "textarea", required: true }, { name: "back", label: "Answer", type: "textarea", required: true },
      ] } },
      { type: "ask", title: "Notes → flashcards", span: 6, props: { mode: "flashcards", submit: "Make cards", rows: 6, template: "Deck: {subject}. Topic: {topic}. Notes:\n{text}",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "topic", type: "text" }, { name: "text", label: "Paste notes", type: "textarea" }] } },
      { type: "bar", title: "Cards per subject", span: 6, bind: { table: "flashcards", whereIn: { deck: SUBJ }, agg: { fn: "count", by: { field: "deck" } } } },
      { type: "bar", title: "Reviews per day, 14 days", span: 6, bind: { table: "reviews", whereIn: { deck: SUBJ }, days: 14, agg: { fn: "count", by: "day" } } },
      { type: "ask", title: "Flashcard rules (how Apollo writes your cards)", span: 12, props: { submit: "Save rules", template: "Remember this as my flashcard_rules fact, replacing any old one: {text}",
        fields: [{ name: "text", label: "Your instructions", type: "textarea" }] } },
    ],
  },
  "school--revise": {
    title: "Revise",
    blocks: [
      { type: "timer", title: "Revision timer", span: 5, props: { minutes: 25, choices: [15, 25, 45, 60, 90], options: SUBJ, logTo: "study_sessions", label: "revision" } },
      { type: "stat", title: "This week", span: 4, props: { unit: "min" }, bind: revision7 },
      { type: "ring", title: "Weekly target", span: 3, props: { goal: 600, unit: "min" }, bind: { table: "study_sessions", days: 7, agg: { fn: "sum", field: "minutes" } } },
      { type: "heatmap", title: "Activity, 28 days", span: 6, bind: { table: "study_sessions", days: 28, agg: { fn: "sum", field: "minutes", by: "day" } } },
      { type: "bar", title: "Minutes by subject, 28 days", span: 6, bind: { table: "study_sessions", days: 28, agg: { fn: "sum", field: "minutes", by: { field: "subject" } } } },
      { type: "bar", title: "Minutes by topic, 28 days", span: 6, bind: { table: "study_sessions", days: 28, agg: { fn: "sum", field: "minutes", by: { field: "topic" } } } },
      { type: "form", title: "Log time manually", span: 6, props: { table: "study_sessions", submit: "Log", fields: [
        { name: "subject", type: "select", options: SUBJ }, { name: "topic" }, { name: "minutes", type: "number", required: true },
      ] } },
      { type: "deepstats", title: "Revision in depth", span: 12, props: { table: "study_sessions", field: "minutes", unit: "min", groupBy: "subject" } },
      { type: "table", title: "Recent sessions", span: 12, bind: { table: "study_sessions", limit: 15 }, props: { columns: ["created_at", "subject", "topic", "minutes"] } },
    ],
  },
  "school--planner": {
    title: "Planner",
    subtitle: "Apollo turns your exams, weak topics and free time into a plan; you tick sessions off.",
    blocks: [
      { type: "countdown", title: "Exam countdown", span: 4, props: { kind: "exam", limit: 6 }, bind: { table: "events", upcoming: { field: "at", days: 365 }, limit: 20 } },
      { type: "list", title: "Today", span: 4, bind: { table: "plan_items", where: { done: false }, upcoming: { field: "date", days: 1 }, limit: 20 },
        props: { primary: "topic", secondary: ["subject", "minutes", "kind"], action: { label: "Done", op: "update", data: { done: true } } } },
      { type: "ring", title: "Plan done this week", span: 4, props: { goal: 100, label: "sessions done" }, bind: { table: "plan_items", where: { done: true }, days: 7, dateField: "date", agg: { fn: "count" } } },
      { type: "ask", title: "Plan my revision", span: 6, props: { submit: "Make the plan", rows: 3, model: "sonnet",
        template: "Make me a revision plan from today until {until}. Use my exams (events, kind exam), weakest topics (past_paper_topics with the lowest pct, then spec_topics), and free time around my timetable, about {mins} minutes a day, mixing subjects (interleaving) and putting topics before each exam. Save each session to plan_items (date as ISO date, subject, topic, minutes, kind 'learn'|'practice'|'past paper'|'review', done false). Keep existing done items. Reply with a 2-line summary. {extra}",
        fields: [{ name: "until", label: "Until (date or 'my last exam')", type: "text" }, { name: "mins", label: "Minutes per day", type: "select", options: ["60", "90", "120", "180", "240"] }, { name: "extra", label: "Anything else", type: "text" }] } },
      { type: "table", title: "Next 7 days", span: 6, bind: { table: "plan_items", upcoming: { field: "date", days: 7 }, limit: 60 }, props: { columns: ["date", "subject", "topic", "minutes", "done"] } },
      { type: "form", title: "Add a session yourself", span: 6, props: { table: "plan_items", submit: "Add", defaults: { done: false, kind: "practice" }, fields: [
        { name: "date", type: "date", required: true }, { name: "subject", type: "select", options: SUBJ }, { name: "topic", required: true }, { name: "minutes", type: "number" },
      ] } },
      { type: "list", title: "Overdue", span: 6, bind: { table: "plan_items", where: { done: false }, due: { field: "date" }, limit: 20 }, props: { primary: "topic", secondary: ["subject", "date"], action: { label: "Done", op: "update", data: { done: true } } } },
    ],
  },
  "school--questions": {
    title: "Questions",
    subtitle: "Real past-paper questions and exam-style ones by topic and subtopic, with mark schemes. Practise, sit timed tests, self-mark or let Apollo mark.",
    blocks: [
      { type: "questionbank", span: 12 },
      { type: "stat", title: "Average score %", span: 3, bind: { table: "question_attempts", agg: { fn: "avg", field: "pct" } } },
      { type: "stat", title: "Questions answered, 7 days", span: 3, bind: { table: "question_attempts", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "bar", title: "Score % by topic", span: 6, bind: { table: "question_attempts", agg: { fn: "avg", field: "pct", by: { field: "topic" } } } },
      { type: "line", title: "Score % over time", span: 6, bind: { table: "question_attempts", days: 90, agg: { fn: "avg", field: "pct", by: "week" } } },
      { type: "bar", title: "Score % by subject", span: 6, bind: { table: "question_attempts", agg: { fn: "avg", field: "pct", by: { field: "subject" } } } },
      { type: "table", title: "Tests", span: 12, bind: { table: "tests", limit: 20 }, props: { columns: ["created_at", "title", "score", "total", "pct", "minutes", "status"] } },
      { type: "deepstats", title: "Question scores in depth", span: 12, props: { table: "question_attempts", field: "pct", groupBy: "subject" } },
    ],
  },
  "school--papers": {
    title: "Past papers",
    blocks: [
      { type: "form", title: "Log a past paper", span: 6, props: { table: "past_papers", submit: "Log paper", fields: [
        { name: "subject", type: "select", options: SUBJ }, { name: "paper", label: "Paper (e.g. Pure 1)", required: true }, { name: "year" },
        { name: "marks", type: "number", required: true }, { name: "total", type: "number", required: true }, { name: "notes", type: "textarea" },
      ] } },
      { type: "form", title: "Marks by topic (for the weak-topic finder)", span: 6, props: { table: "past_paper_topics", submit: "Log topic", fields: [
        { name: "subject", type: "select", options: SUBJ }, { name: "topic", required: true }, { name: "marks", type: "number", required: true }, { name: "total", type: "number", required: true },
      ] } },
      { type: "bar", title: "Average % by subject", span: 4, bind: { table: "past_papers", agg: { fn: "avg", field: "pct", by: { field: "subject" } } } },
      { type: "bar", title: "Average % by topic (lowest = weakest)", span: 8, bind: { table: "past_paper_topics", agg: { fn: "avg", field: "pct", by: { field: "topic" } } } },
      { type: "line", title: "Paper scores over time (%)", span: 6, bind: { table: "past_papers", days: 180, agg: { fn: "avg", field: "pct", by: "week" } } },
      { type: "ask", title: "Fix my weak topics", span: 6, props: { submit: "Do it", template: "Find my 3 weakest topics in {subject} from past_paper_topics (lowest pct). For each: make 6 targeted flashcards (deck {subject}), add a 45-minute practice session to plan_items in the next week, and tell me in 3 lines.",
        fields: [{ name: "subject", type: "select", options: SUBJ }] } },
      { type: "table", title: "Papers", span: 12, bind: { table: "past_papers", limit: 30 }, props: { columns: ["created_at", "subject", "paper", "year", "marks", "total", "pct"] } },
    ],
  },
  "school--tutor": {
    title: "Tutor",
    subtitle: "Goes step by step, prompts you to work things out, cites your notes, aims at full marks.",
    blocks: [
      { type: "ask", title: "Ask the tutor", span: 8, props: { mode: "tutor", submit: "Teach me", rows: 5, thread: "tutor:{subject}", template: "{subject}: {text}",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "text", label: "Topic, question, or paste an exam question", type: "textarea" }] } },
      { type: "text", span: 4, props: { text: "**How it works**\n\n- Each subject keeps its own ongoing tutor chat (see Chats).\n- Say \"I'm stuck\" for a full explanation, or \"just the answer\".\n- It checks your notes and saved sites first and cites them.\n- Add notes on the Notes page to make it better." } },
      { type: "ask", title: "Quiz me", span: 6, props: { mode: "tutor", submit: "Start quiz", thread: "tutor:{subject}", template: "{subject}: quiz me with 5 exam-style questions on {topic}, one at a time, marking each answer like a mark scheme.",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "topic", type: "text" }] } },
      { type: "ask", title: "Mark my answer", span: 6, props: { mode: "tutor", submit: "Mark it", rows: 5, thread: "tutor:{subject}", template: "{subject}: mark this answer out of {marks} like the mark scheme, show where marks were lost and how to get full marks.\nQuestion: {q}\nMy answer: {a}",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "marks", label: "Marks", type: "text" }, { name: "q", label: "Question", type: "textarea" }, { name: "a", label: "My answer", type: "textarea" }] } },
    ],
  },
  "school--notes": {
    title: "Notes",
    blocks: [
      { type: "form", title: "New note", span: 7, props: { table: "notes", submit: "Save note", defaults: { kind: "lesson" }, fields: [
        { name: "subject", type: "select", options: SUBJ }, { name: "kind", type: "select", options: ["lesson", "topic"] }, { name: "topic" },
        { name: "title", required: true }, { name: "body", label: "Notes", type: "textarea", required: true },
      ] } },
      { type: "ask", title: "Turn notes into flashcards", span: 5, props: { mode: "flashcards", submit: "Make cards", rows: 6, template: "Deck: {subject}. Topic: {topic}. Notes:\n{text}",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "topic", type: "text" }, { name: "text", label: "Paste notes", type: "textarea" }] } },
      { type: "list", title: "Latest notes", span: 7, bind: { table: "notes", limit: 20 }, props: { primary: "title", secondary: ["subject", "kind", "topic", "created_at"] } },
      { type: "ask", title: "Learn from a revision website", span: 5, props: { submit: "Read & remember", template: "Ingest this revision page with ingest_url (subject {subject}, board {board}, topic {topic}): {url}",
        fields: [{ name: "url", label: "Page URL", type: "text" }, { name: "subject", type: "select", options: SUBJ }, { name: "board", type: "select", options: ["OCR", "AQA", "Edexcel"] }, { name: "topic", type: "text" }] } },
      { type: "list", title: "Saved websites", span: 12, bind: { table: "sources", limit: 20 }, props: { primary: "title", secondary: ["subject", "board", "topic"], link: "{url}" } },
    ],
  },
  "school--homework": {
    title: "Homework",
    blocks: [
      { type: "microsoft", title: "Teams, Outlook, OneNote & Arbor", span: 12 },
      { type: "form", title: "Add homework", span: 5, props: { table: "homework", defaults: { status: "to do" }, submit: "Add", fields: [
        { name: "title", required: true }, { name: "subject", type: "select", options: SUBJ }, { name: "due_at", label: "Due", type: "date" },
      ] } },
      { type: "list", title: "To do", span: 7, bind: { table: "homework", where: { status: "to do" }, order: { col: "due_at", asc: true }, limit: 40 },
        props: { primary: "title", secondary: ["subject", "class_name", "due_at"], link: "{link}", action: { label: "Done", op: "update", data: { status: "done" } } } },
      { type: "list", title: "Overdue", span: 6, bind: { table: "homework", where: { status: "to do" }, due: { field: "due_at" }, limit: 20 }, props: { primary: "title", secondary: ["subject", "due_at"] } },
      { type: "list", title: "Done", span: 6, bind: { table: "homework", where: { status: "done" }, limit: 15 }, props: { primary: "title", secondary: ["subject", "due_at"] } },
    ],
  },
  "school--timetable": {
    title: "Timetable",
    blocks: [
      { type: "microsoft", title: "Sync lessons from Outlook or Arbor", span: 12 },
      { type: "timetable", title: "This week", span: 12, props: { view: "week" }, bind: { table: "timetable", limit: 300 } },
      { type: "form", title: "Add a lesson", span: 6, props: { table: "timetable", submit: "Add lesson", fields: [
        { name: "day", type: "select", options: DAYS }, { name: "start", type: "time", required: true }, { name: "end", type: "time", required: true },
        { name: "subject", type: "select", options: [...SUBJ, "Free", "Tutor", "Other"] }, { name: "room" },
      ] } },
      { type: "ask", title: "Enter my timetable for me", span: 6, props: { submit: "Add it", rows: 6, template: "Add these lessons to my timetable table (day 1=Mon…7=Sun, start/end as HH:MM, subject, room). Replace nothing. Lessons:\n{text}",
        fields: [{ name: "text", label: "Paste your timetable as text", type: "textarea" }] } },
      { type: "form", title: "Add an exam, deadline or event", span: 6, props: { table: "events", submit: "Add", defaults: { kind: "exam" }, fields: [
        { name: "title", required: true }, { name: "kind", type: "select", options: ["exam", "deadline", "event", "trip"] }, { name: "at", label: "When", type: "datetime-local", required: true },
        { name: "subject", type: "select", options: [...SUBJ, "Other"] }, { name: "location" },
      ] } },
      { type: "agenda", title: "Next 30 days", span: 6, props: { days: 30, limit: 15 } },
      { type: "table", title: "All lessons", span: 12, bind: { table: "timetable", limit: 300, order: { col: "day", asc: true } }, props: { columns: ["day", "start", "end", "subject", "room"] } },
    ],
  },
  "school--resources": {
    title: "Resources",
    blocks: [
      { type: "form", title: "Save a link or video", span: 5, props: { table: "resource_links", submit: "Save", fields: [
        { name: "title", required: true }, { name: "url", required: true }, { name: "subject", type: "select", options: SUBJ }, { name: "topic" },
      ] } },
      { type: "list", title: "Saved", span: 7, bind: { table: "resource_links", limit: 40 }, props: { primary: "title", secondary: ["subject", "topic"], link: "{url}" } },
      { type: "ask", title: "Find me resources", span: 12, props: { mode: "tutor", submit: "Suggest", template: "{subject}, {topic}: suggest the best free resources (well-known revision sites, YouTube channels, past-paper sources) for my exam board. Only name ones you're confident exist; I'll save the ones I like.",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "topic", type: "text" }] } },
    ],
  },
  "school--opportunities": {
    title: "Opportunities",
    subtitle: "Searched weekly on Sunday evening. Every item has its source link; deadlines only when the source states one.",
    blocks: [
      { type: "list", title: "Found", span: 8, bind: { table: "opportunities", limit: 40 }, props: { primary: "title", secondary: ["summary", "deadline", "subject"], link: "{url}" } },
      { type: "agenda", title: "Deadlines", span: 4, props: { days: 90 } },
    ],
  },
  "school--subjects": {
    title: "Subjects",
    subtitle: "Further Maths options and the Physics optional topic are still to decide; record them here when you know.",
    blocks: [
      { type: "table", title: "Subjects", span: 6, bind: { table: "subjects", limit: 20 }, props: { columns: ["name", "board", "options"] } },
      { type: "ask", title: "Update a subject", span: 6, props: { submit: "Save", template: "Update the subjects table: set {field} for {subject} to: {value}",
        fields: [{ name: "subject", type: "select", options: SUBJ }, { name: "field", type: "select", options: ["options", "board"] }, { name: "value", type: "text" }] } },
      { type: "form", title: "Add a spec topic", span: 6, props: { table: "spec_topics", submit: "Add", fields: [
        { name: "subject", type: "select", options: SUBJ }, { name: "code", label: "Spec code" }, { name: "title", required: true },
      ] } },
      { type: "list", title: "Spec topics", span: 6, bind: { table: "spec_topics", limit: 100, order: { col: "subject", asc: true } }, props: { primary: "title", secondary: ["subject", "code"] } },
    ],
  },

  /* ======================= fitness ======================= */
  fitness: {
    title: "Fitness",
    subtitle: "Push · pull · legs",
    blocks: [
      tile("Log", "/s/fitness/log", { table: "sets", days: 7, agg: { fn: "count" } }, "sets this week"),
      tile("Progress", "/s/fitness/progress", { table: "sets", days: 7, agg: { fn: "sum", field: "volume" } }, "kg volume this week", "kg"),
      tile("Routines", "/s/fitness/routines", { table: "routines", agg: { fn: "count" } }, "saved"),
      tile("Recovery", "/s/fitness/recovery", { table: "recovery_logs", agg: { fn: "last", field: "energy" } }, "last energy (1-5)"),
      { type: "bar", title: "Volume per day (kg)", span: 7, bind: { table: "sets", days: 14, agg: { fn: "sum", field: "volume", by: "day" } } },
      { type: "donut", title: "Split, 28 days", span: 5, bind: { table: "sets", days: 28, agg: { fn: "count", by: { field: "routine" } } } },
    ],
  },
  "fitness--log": {
    title: "Log",
    blocks: [
      { type: "form", title: "Log a set", span: 12, props: { table: "sets", submit: "Log set", fields: [
        { name: "routine", type: "select", options: ["push", "pull", "legs", "other"] }, { name: "exercise", required: true },
        { name: "weight_kg", label: "Weight (kg)", type: "number" }, { name: "reps", type: "number", required: true },
      ] } },
      { type: "timer", title: "Rest timer", span: 4, props: { minutes: 2, choices: [1, 2, 3, 5] } },
      { type: "table", title: "Today and recent", span: 8, bind: { table: "sets", limit: 20 }, props: { columns: ["created_at", "routine", "exercise", "weight_kg", "reps", "volume"] } },
    ],
  },
  "fitness--progress": {
    title: "Progress",
    blocks: [
      { type: "bar", title: "Best weight by exercise, 90 days (kg)", span: 12, bind: { table: "sets", days: 90, agg: { fn: "max", field: "weight_kg", by: { field: "exercise" } } } },
      { type: "line", title: "Squat best per day", span: 6, bind: { table: "sets", where: { exercise: "Squat" }, days: 90, agg: { fn: "max", field: "weight_kg", by: "day" } } },
      { type: "line", title: "Bench press best per day", span: 6, bind: { table: "sets", where: { exercise: "Bench press" }, days: 90, agg: { fn: "max", field: "weight_kg", by: "day" } } },
      { type: "bar", title: "Weekly volume (kg), 12 weeks", span: 12, bind: { table: "sets", days: 84, agg: { fn: "sum", field: "volume", by: "week" } } },
      { type: "deepstats", title: "Volume per set in depth", span: 12, props: { table: "sets", field: "volume", unit: "kg", groupBy: "exercise" } },
      { type: "deepstats", title: "Weight lifted in depth", span: 12, props: { table: "sets", field: "weight_kg", unit: "kg", groupBy: "exercise" } },
    ],
  },
  "fitness--routines": {
    title: "Routines",
    blocks: [
      { type: "form", title: "New routine", span: 5, props: { table: "routines", submit: "Save", fields: [
        { name: "name", required: true }, { name: "day", label: "Split", type: "select", options: ["push", "pull", "legs", "full body"] },
        { name: "exercises", label: "Exercises (one per line, e.g. Bench press 4×8)", type: "textarea" },
      ] } },
      { type: "list", title: "Routines", span: 7, bind: { table: "routines", limit: 20 }, props: { primary: "name", secondary: ["day", "exercises"] } },
      { type: "ask", title: "Build me a routine", span: 12, props: { submit: "Build it", template: "Design a {split} routine for me ({goal}), save it to the routines table (name, day, exercises one per line with sets×reps), and tell me in one line.",
        fields: [{ name: "split", type: "select", options: ["push", "pull", "legs", "full body"] }, { name: "goal", type: "select", options: ["strength", "hypertrophy", "general fitness"] }] } },
    ],
  },
  "fitness--recovery": {
    title: "Recovery",
    blocks: [
      { type: "form", title: "How do you feel?", span: 5, props: { table: "recovery_logs", submit: "Log", fields: [
        { name: "energy", label: "Energy (1-5)", type: "select", options: ["1", "2", "3", "4", "5"] }, { name: "soreness", label: "Soreness (1-5)", type: "select", options: ["1", "2", "3", "4", "5"] },
        { name: "notes", type: "textarea" },
      ] } },
      { type: "line", title: "Energy, 30 days", span: 7, bind: { table: "recovery_logs", days: 30, agg: { fn: "avg", field: "energy", by: "day" } } },
      { type: "line", title: "Sleep, 30 days (h)", span: 6, bind: { table: "sleep_logs", days: 30, agg: { fn: "avg", field: "hours", by: "day" } } },
      { type: "line", title: "Soreness, 30 days", span: 6, bind: { table: "recovery_logs", days: 30, agg: { fn: "avg", field: "soreness", by: "day" } } },
    ],
  },

  /* ======================= nutrition and sleep ======================= */
  nutrition: {
    title: "Nutrition and sleep",
    blocks: [
      tile("Meals", "/s/nutrition/meals", { table: "meals", days: 1, agg: { fn: "sum", field: "kcal" } }, "kcal, last 24 h"),
      tile("Recipes", "/s/nutrition/recipes", { table: "recipes", agg: { fn: "count" } }, "saved"),
      tile("Sleep", "/s/nutrition/sleep", { table: "sleep_logs", days: 7, agg: { fn: "avg", field: "hours" } }, "7-day average", "h"),
      tile("Screen time", "/s/nutrition/screentime", { table: "screentime_days", days: 7, agg: { fn: "avg", field: "minutes" } }, "daily average", "min"),
      { type: "bar", title: "Protein per day (g), 14 days", span: 6, bind: { table: "meals", days: 14, agg: { fn: "sum", field: "protein_g", by: "day" } } },
      { type: "line", title: "Sleep, 14 days (h)", span: 6, bind: { table: "sleep_logs", days: 14, agg: { fn: "avg", field: "hours", by: "day" } } },
    ],
  },
  "nutrition--meals": {
    title: "Meals",
    blocks: [
      { type: "stat", title: "Calories, 24 h", span: 3, props: { unit: "kcal" }, bind: { table: "meals", days: 1, agg: { fn: "sum", field: "kcal" } } },
      { type: "stat", title: "Protein, 24 h", span: 3, props: { unit: "g" }, bind: { table: "meals", days: 1, agg: { fn: "sum", field: "protein_g" } } },
      { type: "ring", title: "Protein target", span: 3, props: { goal: 120, unit: "g" }, bind: { table: "meals", days: 1, agg: { fn: "sum", field: "protein_g" } } },
      { type: "stat", title: "Meals, 7 days", span: 3, bind: { table: "meals", days: 7, agg: { fn: "count", by: "day" } } },
      { type: "list", title: "One tap to log a recipe", span: 6, bind: { table: "recipes", limit: 30, order: { col: "name", asc: true } },
        props: { primary: "name", secondary: ["kcal", "protein_g"], action: { label: "Log meal", op: "create", table: "meals", map: { name: "$name", kcal: "$kcal", protein_g: "$protein_g", recipe_id: "$id" } } } },
      { type: "form", title: "Log something else", span: 6, props: { table: "meals", fields: [
        { name: "name", required: true }, { name: "kcal", type: "number" }, { name: "protein_g", label: "Protein (g)", type: "number" },
      ] } },
      { type: "deepstats", title: "Protein in depth", span: 12, props: { table: "meals", field: "protein_g", unit: "g", groupBy: "name" } },
      { type: "table", title: "Recent meals", span: 12, bind: { table: "meals", limit: 20 }, props: { columns: ["created_at", "name", "kcal", "protein_g"] } },
    ],
  },
  "nutrition--recipes": {
    title: "Recipes",
    subtitle: "Saved recipes are never regenerated.",
    blocks: [
      { type: "form", title: "Save a recipe", span: 6, props: { table: "recipes", submit: "Save recipe", fields: [
        { name: "name", required: true }, { name: "servings", type: "number" }, { name: "kcal", label: "kcal / serving", type: "number" },
        { name: "protein_g", label: "Protein / serving (g)", type: "number" }, { name: "tags" }, { name: "ingredients", type: "textarea" }, { name: "steps", type: "textarea" },
      ] } },
      { type: "ask", title: "Suggest a recipe", span: 6, props: { submit: "Suggest", template: "Suggest one {kind} recipe ({extra}). If I like it I'll ask you to save it; then save it to recipes with kcal and protein per serving.",
        fields: [{ name: "kind", type: "select", options: ["high-protein", "quick (under 20 min)", "cheap", "breakfast", "post-workout"] }, { name: "extra", label: "Anything else", type: "text" }] } },
      { type: "list", title: "Your recipes", span: 12, bind: { table: "recipes", limit: 60, order: { col: "name", asc: true } }, props: { primary: "name", secondary: ["kcal", "protein_g", "tags", "ingredients"] } },
    ],
  },
  "nutrition--sleep": {
    title: "Sleep",
    blocks: [
      { type: "form", title: "Log sleep", span: 4, props: { table: "sleep_logs", fields: [
        { name: "hours", type: "number", required: true }, { name: "quality", type: "select", options: ["1", "2", "3", "4", "5"] },
      ] } },
      { type: "stat", title: "7-day average", span: 4, props: { unit: "h", goal: 8 }, bind: { table: "sleep_logs", days: 7, agg: { fn: "avg", field: "hours" } } },
      { type: "ring", title: "vs 8 h", span: 4, props: { goal: 8, unit: "h" }, bind: { table: "sleep_logs", days: 7, agg: { fn: "avg", field: "hours" } } },
      { type: "line", title: "Hours, 30 days", span: 12, bind: { table: "sleep_logs", days: 30, agg: { fn: "avg", field: "hours", by: "day" } } },
      { type: "deepstats", title: "Sleep in depth", span: 12, props: { table: "sleep_logs", field: "hours", unit: "h" } },
    ],
  },
  "nutrition--screentime": {
    title: "Screen time",
    subtitle: "iPhone can't share Screen Time with websites: log it here (or send Apollo a screenshot once uploads arrive). On Android this can be automated.",
    blocks: [
      { type: "form", title: "Log a day", span: 4, props: { table: "screentime_days", fields: [{ name: "minutes", type: "number", required: true }, { name: "source", type: "select", options: ["iPhone", "Android", "Laptop"] }] } },
      { type: "stat", title: "Daily average, 7 days", span: 4, props: { unit: "min" }, bind: { table: "screentime_days", days: 7, agg: { fn: "avg", field: "minutes" } } },
      { type: "stat", title: "Yesterday", span: 4, props: { unit: "min" }, bind: { table: "screentime_days", agg: { fn: "last", field: "minutes" } } },
      { type: "bar", title: "Minutes per day, 30 days", span: 12, bind: { table: "screentime_days", days: 30, agg: { fn: "sum", field: "minutes", by: "day" } } },
    ],
  },

  /* ======================= projects ======================= */
  projects: {
    title: "Projects",
    blocks: [
      { type: "kanban", title: "Board", span: 12, bind: { table: "projects", limit: 100 }, props: { statusField: "status", columns: ["idea", "active", "paused", "done"], primary: "name" } },
      { type: "form", title: "New project", span: 5, props: { table: "projects", defaults: { status: "idea" }, fields: [
        { name: "name", required: true }, { name: "status", type: "select", options: ["idea", "active", "paused", "done"] }, { name: "link" }, { name: "summary", type: "textarea" },
      ] } },
      tile("Notes", "/s/projects/notes", { table: "project_notes", days: 7, agg: { fn: "count" } }, "this week", undefined, 3),
      tile("Links", "/s/projects/links", { table: "project_links", agg: { fn: "count" } }, "saved", undefined, 2),
      tile("Chat", "/s/projects/chat", undefined, "a chat per project", undefined, 2),
      { type: "list", title: "Files from Apollo/Claude", span: 7, bind: { table: "files", limit: 8 }, props: { primary: "name", secondary: ["project", "created_at"], link: "/api/files/{id}" } },
    ],
  },
  "projects--notes": {
    title: "Project notes",
    blocks: [
      { type: "form", title: "Quick note", span: 5, props: { table: "project_notes", submit: "Save note", fields: [
        { name: "project", type: "select", optionsFrom: PROJECT }, { name: "text", type: "textarea", required: true },
      ] } },
      { type: "list", title: "Notes", span: 7, bind: { table: "project_notes", limit: 40 }, props: { primary: "text", secondary: ["project", "created_at"] } },
    ],
  },
  "projects--links": {
    title: "Project links",
    blocks: [
      { type: "form", title: "Save a link", span: 5, props: { table: "project_links", submit: "Save", fields: [
        { name: "project", type: "select", optionsFrom: PROJECT }, { name: "title" }, { name: "url", required: true },
      ] } },
      { type: "list", title: "Links", span: 7, bind: { table: "project_links", limit: 40 }, props: { primary: "title", secondary: ["project", "url"], link: "{url}" } },
    ],
  },
  "projects--chat": {
    title: "Project chat",
    subtitle: "Each project keeps its own ongoing chat, with that project's context.",
    blocks: [
      { type: "ask", title: "Talk about a project", span: 8, props: { submit: "Send", rows: 5, thread: "project:{project}",
        template: "Project {project}. Use its record, notes and links (list_records on projects / project_notes / project_links) as context. Save anything worth keeping with save_file (project {project}). {text}",
        fields: [{ name: "project", type: "select", optionsFrom: PROJECT }, { name: "text", label: "Message", type: "textarea" }] } },
      { type: "list", title: "Files", span: 4, bind: { table: "files", limit: 15 }, props: { primary: "name", secondary: ["project"], link: "/api/files/{id}" } },
    ],
  },

  /* ======================= mind sports ======================= */
  mind: {
    title: "Mind sports",
    blocks: [
      tile("Chess", "/s/mind/chess", { table: "chess_ratings", where: { time_class: "rapid" }, agg: { fn: "last", field: "rating" } }, "rapid rating", undefined, 4),
      tile("Puzzles", "/s/mind/puzzles", { table: "puzzle_attempts", where: { solved: true }, days: 7, agg: { fn: "count" } }, "solved this week", undefined, 4),
      tile("Openings", "/s/mind/openings", { table: "opening_drills", days: 7, agg: { fn: "count" } }, "drills this week", undefined, 4),
      tile("Poker", "/s/mind/poker", { table: "poker_sessions", agg: { fn: "sum", field: "profit" } }, "all-time P&L (play money)", undefined, 4),
      tile("Geography", "/s/mind/geography", { table: "geo_attempts", where: { correct: true }, days: 7, agg: { fn: "count" } }, "correct this week", undefined, 4),
      tile("Brain tests", "/s/mind/brain", { table: "brain_test_results", where: { test: "reaction" }, days: 30, agg: { fn: "min", field: "score" } }, "best reaction, 30 days", "ms", 4),
      tile("Memory sports", "/s/mind/memory", { table: "memory_sessions", agg: { fn: "max", field: "score" } }, "best score", undefined, 4),
      tile("Programming", "/s/mind/coding", { table: "coding_stats", where: { platform: "codeforces" }, agg: { fn: "last", field: "rating" } }, "Codeforces rating", undefined, 4),
    ],
  },
  "mind--chess": {
    title: "Chess",
    subtitle: "Apollo explains; Stockfish calculates (analysis board coming next).",
    blocks: [
      { type: "sync", title: "chess.com", span: 4, props: { service: "chess", label: "Sync chess.com games" } },
      { type: "stat", title: "Rapid", span: 4, bind: { table: "chess_ratings", where: { time_class: "rapid" }, agg: { fn: "last", field: "rating" } } },
      { type: "donut", title: "Results, 30 days", span: 4, bind: { table: "chess_games", days: 30, agg: { fn: "count", by: { field: "result" } } } },
      { type: "line", title: "Rating, 60 days", span: 8, bind: { table: "chess_games", days: 60, agg: { fn: "last", field: "rating", by: "day" } } },
      { type: "donut", title: "Time controls, 60 days", span: 4, bind: { table: "chess_games", days: 60, agg: { fn: "count", by: { field: "time_class" } } } },
      { type: "deepstats", title: "Rating in depth", span: 12, props: { table: "chess_games", field: "rating", groupBy: "result" } },
      { type: "list", title: "Recent games", span: 12, bind: { table: "chess_games", limit: 15 }, props: { primary: "opponent", secondary: ["result", "time_class", "rating", "created_at"], link: "{url}" } },
    ],
  },
  "mind--analysis": {
    title: "Play & analyse",
    subtitle: "Play Stockfish from 400 to 3000 Elo with human-like moves and thinking time, from the start or any position you set up. Analysis shows when you're not playing.",
    blocks: [
      { type: "chessboard", span: 12 },
      { type: "bar", title: "Your score vs Stockfish by Elo (1 = win)", span: 6, bind: { table: "chess_practice", agg: { fn: "avg", field: "score", by: { field: "elo" } } } },
      { type: "donut", title: "Results", span: 3, bind: { table: "chess_practice", agg: { fn: "count", by: { field: "result" } } } },
      { type: "stat", title: "Games, 12 weeks", span: 3, bind: { table: "chess_practice", agg: { fn: "count", by: "week" }, days: 84 } },
      { type: "table", title: "Recent practice games", span: 12, bind: { table: "chess_practice", limit: 15 }, props: { columns: ["created_at", "elo", "color", "result", "how", "plies"] } },
    ],
  },
  "mind--openings": {
    title: "Openings",
    subtitle: "Play your side of the main line from memory; the trainer answers with the book reply.",
    blocks: [
      { type: "openings", span: 9, bind: { table: "opening_drills", limit: 500 } },
      { type: "bar", title: "Drills per opening", span: 3, rows: 2, bind: { table: "opening_drills", agg: { fn: "count", by: { field: "name" } } } },
      { type: "table", title: "Recent drills", span: 12, bind: { table: "opening_drills", limit: 12 }, props: { columns: ["created_at", "name", "side", "mistakes"] } },
    ],
  },
  "mind--puzzles": {
    title: "Puzzles",
    subtitle: "Lichess tactics by theme and difficulty, plus positions from your own mistakes.",
    blocks: [
      { type: "puzzles", span: 9, bind: { table: "chess_puzzles", limit: 200 } },
      { type: "stat", title: "Solved, 7 days", span: 3, bind: { table: "puzzle_attempts", where: { solved: true }, days: 7, agg: { fn: "count", by: "day" } } },
      { type: "donut", title: "Solved vs missed, 30 days", span: 3, bind: { table: "puzzle_attempts", days: 30, agg: { fn: "count", by: { field: "solved" } } } },
      { type: "stat", title: "Solve rate %", span: 3, bind: { table: "puzzle_attempts", agg: { fn: "pct", field: "solved" } } },
      { type: "bar", title: "Solve rate by theme %", span: 9, bind: { table: "puzzle_attempts", agg: { fn: "pct", field: "solved", by: { field: "themes" } } } },
      { type: "deepstats", title: "Puzzle ratings attempted", span: 12, props: { table: "puzzle_attempts", field: "rating", groupBy: "solved" } },
    ],
  },
  "mind--review": {
    title: "Game review",
    subtitle: "Every move classified from Stockfish (brilliant, great, best… blunder), with accuracy, an eval graph and the better line. Your mistakes become puzzles.",
    blocks: [{ type: "gamereview", span: 12, bind: { table: "chess_games", limit: 40 } }],
  },
  "mind--poker": {
    title: "Poker",
    subtitle: "Practice table with play chips only, against human-like bots. Real-money sites (PokerStars and the like) are 18+ for every account, so they aren't connected.",
    blocks: [
      { type: "poker", span: 12 },
      { type: "stat", title: "Hands played", span: 2, bind: { table: "poker_practice", agg: { fn: "count", by: "day" }, days: 30 } },
      { type: "stat", title: "Win rate (bb/100)", span: 2, bind: { table: "poker_practice", agg: { fn: "per100", field: "net_bb" } } },
      { type: "stat", title: "VPIP %", span: 2, bind: { table: "poker_practice", agg: { fn: "pct", field: "vpip" } } },
      { type: "stat", title: "PFR %", span: 2, bind: { table: "poker_practice", agg: { fn: "pct", field: "pfr" } } },
      { type: "stat", title: "Hands won %", span: 2, bind: { table: "poker_practice", agg: { fn: "pct", field: "won" } } },
      { type: "stat", title: "Showdown won %", span: 2, bind: { table: "poker_practice", where: { showdown: true }, agg: { fn: "pct", field: "won" } } },
      { type: "line", title: "Net big blinds per day", span: 6, bind: { table: "poker_practice", days: 30, agg: { fn: "sum", field: "net_bb", by: "day" } } },
      { type: "bar", title: "Win rate by table size (bb/100)", span: 6, bind: { table: "poker_practice", agg: { fn: "per100", field: "net_bb", by: { field: "opponents" } } } },
      { type: "deepstats", title: "Practice in depth: big blinds per hand", span: 12, props: { table: "poker_practice", field: "net_bb", unit: "bb", groupBy: "opponents" } },
      { type: "form", title: "Home game session", span: 6, props: { table: "poker_sessions", submit: "Log session", fields: [
        { name: "game", type: "select", options: ["Home game", "Play money"] }, { name: "buy_in", type: "number" }, { name: "cash_out", type: "number" }, { name: "notes", type: "textarea" },
      ] } },
      { type: "ask", title: "Review a hand with Apollo", span: 6, props: { submit: "Review", rows: 5, template: "Review this poker hand (home game / play money) like a coach: ranges, sizing, mistakes, better lines.\n{text}", fields: [{ name: "text", label: "The hand", type: "textarea" }] } },
      { type: "bar", title: "Home-game P&L by week", span: 6, bind: { table: "poker_sessions", days: 180, agg: { fn: "sum", field: "profit", by: "week" } } },
      { type: "list", title: "Saved hands", span: 6, bind: { table: "poker_hands", limit: 20 }, props: { primary: "hand", secondary: ["notes"] } },
    ],
  },
  "mind--geography": {
    title: "Geography",
    subtitle: "From the world-countries dataset, not the AI. Confusable neighbours as wrong answers; misses come back sooner.",
    blocks: [
      { type: "geo", title: "Quiz", span: 8 },
      { type: "stat", title: "Correct, 7 days", span: 4, bind: { table: "geo_attempts", where: { correct: true }, days: 7, agg: { fn: "count" } } },
      { type: "bar", title: "Most missed", span: 6, bind: { table: "geo_attempts", where: { correct: false }, days: 60, agg: { fn: "count", by: { field: "item" } } } },
      { type: "donut", title: "By quiz type, 30 days", span: 6, bind: { table: "geo_attempts", days: 30, agg: { fn: "count", by: { field: "kind" } } } },
    ],
  },
  "mind--brain": {
    title: "Brain tests",
    subtitle: "Human Benchmark-style tests. Pick one; your statistics appear under each test.",
    blocks: [
      { type: "benchmark", span: 12 },
      { type: "bar", title: "Best per test, 90 days", span: 4, bind: { table: "brain_test_results", days: 90, agg: { fn: "max", field: "score", by: { field: "test" } } } },
      { type: "line", title: "Reaction (ms), 60 days", span: 6, bind: { table: "brain_test_results", where: { test: "reaction" }, days: 60, agg: { fn: "min", field: "score", by: "day" } } },
      { type: "line", title: "Typing (wpm), 60 days", span: 6, bind: { table: "brain_test_results", where: { test: "typing" }, days: 60, agg: { fn: "max", field: "score", by: "day" } } },
    ],
  },
  "mind--memory": {
    title: "Memory sports",
    blocks: [
      { type: "cards", title: "Card memory", span: 7 },
      { type: "brain", title: "Number memory", span: 5, props: { test: "numbers" } },
      { type: "form", title: "Memory palace builder", span: 5, props: { table: "palaces", submit: "Add locus", fields: [
        { name: "palace", required: true }, { name: "position", type: "number" }, { name: "locus", label: "Location (e.g. front door)", required: true }, { name: "image", label: "What you store there" },
      ] } },
      { type: "table", title: "Your palaces", span: 7, bind: { table: "palaces", limit: 100, order: { col: "position", asc: true } }, props: { columns: ["palace", "position", "locus", "image"] } },
      { type: "line", title: "Card memory score, 60 days", span: 12, bind: { table: "memory_sessions", where: { kind: "cards" }, days: 60, agg: { fn: "max", field: "score", by: "day" } } },
    ],
  },
  "mind--coding": {
    title: "Programming",
    blocks: [
      { type: "sync", title: "Codeforces", span: 4, props: { service: "codeforces", label: "Sync Codeforces" } },
      { type: "stat", title: "Codeforces rating", span: 4, bind: { table: "coding_stats", where: { platform: "codeforces" }, agg: { fn: "last", field: "rating" } } },
      { type: "stat", title: "Problems solved", span: 4, bind: { table: "coding_stats", where: { platform: "codeforces" }, agg: { fn: "last", field: "solved" } } },
      { type: "form", title: "Advent of Code (log stars)", span: 6, props: { table: "coding_stats", defaults: { platform: "aoc" }, submit: "Log", fields: [{ name: "solved", label: "Stars", type: "number", required: true }, { name: "rank", label: "Year / note" }] } },
      { type: "stat", title: "AoC stars", span: 6, bind: { table: "coding_stats", where: { platform: "aoc" }, agg: { fn: "sum", field: "solved" } } },
    ],
  },

  /* ======================= languages ======================= */
  languages: {
    title: "Languages",
    blocks: [
      { type: "review", title: "Due across languages", span: 7, props: { decks: LANGS } },
      { type: "bar", title: "Cards due per language", span: 5, bind: { table: "flashcards", due: { field: "due_at", includeNull: true }, whereIn: { deck: LANGS }, agg: { fn: "count", by: { field: "deck" } } } },
      ...LANGS.map((l) => tile(l, `/s/languages/${l.toLowerCase()}`, { table: "flashcards", where: { deck: l }, agg: { fn: "count" } }, "cards")),
      tile("Conversation", "/s/languages/conversation", undefined, "practise with Apollo", undefined, 12),
    ],
  },
  ...Object.fromEntries(LANGS.map((l) => [`languages--${l.toLowerCase()}`, {
    title: l,
    subtitle: { Mandarin: "HSK 1: characters, pinyin and tones", Spanish: "From A1", French: "GCSE 9 refresh, then beyond", English: "Vocabulary" }[l],
    blocks: [
      { type: "review", title: "Review", span: 7, props: { deck: l } },
      { type: "stat", title: "Due now", span: 5, bind: dueCards([l]) },
      { type: "ask", title: "Words of the day", span: 6, props: { mode: "flashcards", submit: "Give me today's words", template: `Make 5 useful ${l} words of the day at my level as flashcards (deck ${l}): word on the front; meaning, ${l === "Mandarin" ? "pinyin with tone marks and the tone numbers" : l === "English" ? "a definition, register and etymology" : "gender/plural where relevant"} and one example sentence on the back. Skip words I already have. {focus}`,
        fields: [{ name: "focus", label: "Topic (optional)", type: "text" }] } },
      { type: "form", title: "Add a word", span: 6, props: { table: "flashcards", defaults: { deck: l }, submit: "Add", fields: [
        { name: "front", label: l === "Mandarin" ? "Character(s)" : "Word / phrase", required: true }, { name: "back", label: l === "Mandarin" ? "Pinyin (tones) + meaning" : "Meaning", required: true }, { name: "topic" },
      ] } },
      ...(l === "Mandarin" ? [{ type: "ask" as const, title: "Tone drill", span: 12, props: { mode: "conversation", submit: "Drill me", thread: "lang:Mandarin", template: "Mandarin tone drill: give me 8 HSK 1 words one at a time as characters only; I'll answer with pinyin + tone numbers; correct me each time and explain tone sandhi when it applies. {text}", fields: [{ name: "text", label: "Anything to focus on", type: "text" }] } }] : []),
      { type: "bar", title: "Reviews per day, 14 days", span: 12, bind: { table: "reviews", where: { deck: l }, days: 14, agg: { fn: "count", by: "day" } } },
    ],
  } satisfies PageSpec])),
  "languages--conversation": {
    title: "Conversation",
    subtitle: "Type here, or use the mic on the home page and say which language. Apollo corrects you and teaches one new word each turn.",
    blocks: [
      { type: "ask", title: "Practise", span: 8, props: { mode: "conversation", submit: "Send", rows: 4, thread: "lang:{lang}", template: "Language: {lang}. {text}",
        fields: [{ name: "lang", label: "Language", type: "select", options: ["Spanish", "French", "Mandarin"] }, { name: "text", label: "Say something", type: "textarea" }] } },
      { type: "text", span: 4, props: { text: "Each language keeps its own ongoing conversation (see Chats), so Apollo remembers where you got to.\n\nTip: turn on **Spoken replies: always** in Ctrl/Cmd+K to hear answers." } },
    ],
  },

  /* ======================= library ======================= */
  library: {
    title: "Library",
    blocks: [
      tile("Books", "/s/library/books", { table: "books", where: { status: "reading" }, agg: { fn: "count" } }, "reading now", undefined, 3),
      tile("Journal", "/s/library/journal", { table: "journal_entries", days: 30, agg: { fn: "count" } }, "entries this month", undefined, 3),
      tile("Files", "/s/library/files", { table: "files", agg: { fn: "count" } }, "saved", undefined, 3),
      tile("Reports", "/s/library/reports", { table: "weekly_reports", agg: { fn: "last", field: "overall" } }, "last weekly score", undefined, 3),
      { type: "bar", title: "Pages read, 14 days", span: 6, bind: { table: "reading_logs", days: 14, agg: { fn: "sum", field: "pages", by: "day" } } },
      { type: "list", title: "Latest report", span: 6, bind: { table: "weekly_reports", limit: 1, order: { col: "week", asc: false } }, props: { primary: "commentary", secondary: ["grade"] } },
    ],
  },
  "library--books": {
    title: "Books",
    blocks: [
      { type: "kanban", title: "Shelf", span: 12, bind: { table: "books", limit: 80 }, props: { statusField: "status", columns: ["to read", "reading", "finished"], primary: "title" } },
      { type: "form", title: "Add a book", span: 4, props: { table: "books", defaults: { status: "to read" }, fields: [{ name: "title", required: true }, { name: "author" }, { name: "pages", type: "number" }] } },
      { type: "form", title: "Log reading", span: 4, props: { table: "reading_logs", submit: "Log", fields: [{ name: "book", type: "select", optionsFrom: { table: "books", field: "title" } }, { name: "pages", type: "number", required: true }] } },
      { type: "stat", title: "Pages this week", span: 4, bind: { table: "reading_logs", days: 7, agg: { fn: "sum", field: "pages", by: "day" } } },
    ],
  },
  "library--journal": {
    title: "Journal",
    subtitle: "Private by default: Apollo can only read entries you mark shareable.",
    blocks: [
      { type: "form", title: "New entry", span: 12, props: { table: "journal_entries", submit: "Save entry", fields: [
        { name: "text", label: "Entry", type: "textarea", required: true }, { name: "mood", type: "select", options: ["great", "good", "ok", "low", "bad"] }, { name: "shareable", label: "Apollo may read this", type: "checkbox" },
      ] } },
      { type: "list", title: "Entries", span: 8, bind: { table: "journal_entries", limit: 30 }, props: { primary: "text", secondary: ["mood", "created_at"] } },
      { type: "donut", title: "Mood, 30 days", span: 4, bind: { table: "journal_entries", days: 30, agg: { fn: "count", by: { field: "mood" } } } },
    ],
  },
  "library--files": {
    title: "Files",
    subtitle: "Things Apollo or Claude made for you (saved with save_file).",
    blocks: [
      { type: "list", title: "Files", span: 12, bind: { table: "files", limit: 60 }, props: { primary: "name", secondary: ["project", "source", "created_at"], link: "/api/files/{id}" } },
    ],
  },
  "library--reports": {
    title: "Weekly reports",
    blocks: [
      { type: "scores", title: "This week so far", span: 6 },
      { type: "history", title: "Last 8 weeks", span: 6 },
      { type: "list", title: "Reports", span: 12, bind: { table: "weekly_reports", limit: 20, order: { col: "week", asc: false } }, props: { primary: "commentary", secondary: ["title", "grade", "overall"] } },
    ],
  },

  /* ======================= stats ======================= */
  stats: {
    title: "Stats",
    subtitle: "Computed from your logs by fixed formulas. Missing data shows as no data.",
    blocks: [
      tile("Revision, 7 days", "/s/school/revise", revision7, "minutes", "min"),
      tile("Sets, 7 days", "/s/fitness", { table: "sets", days: 7, agg: { fn: "count" } }, "logged"),
      tile("Sleep, 7 days", "/s/nutrition/sleep", { table: "sleep_logs", days: 7, agg: { fn: "avg", field: "hours" } }, "average", "h"),
      tile("Card reviews, 7 days", "/s/school/flashcards", { table: "reviews", days: 7, agg: { fn: "count" } }, "all decks"),
      { type: "scores", title: "This week", span: 6 },
      { type: "history", title: "Weekly scores, stacked", span: 6 },
      { type: "heatmap", title: "Activity, 14 days", span: 6, bind: { table: "action_log", days: 14, agg: { fn: "count", by: "day" } } },
      { type: "donut", title: "Share of activity, 28 days", span: 6, bind: { table: "action_log", days: 28, agg: { fn: "count", by: { field: "table_name" } } } },
      { type: "insights", title: "Patterns", span: 6 },
      { type: "table", title: "Latest logs", span: 6, bind: { table: "action_log", limit: 12 }, props: { columns: ["created_at", "actor", "tool", "table_name"] } },
      { type: "bar", title: "Languages: reviews by language, 28 days", span: 6, bind: { table: "reviews", whereIn: { deck: LANGS }, days: 28, agg: { fn: "count", by: { field: "deck" } } } },
      { type: "list", title: "Opportunities", span: 6, bind: { table: "opportunities", limit: 6 }, props: { primary: "title", secondary: ["deadline"], link: "{url}" } },
    ],
  },
  "stats--scores": {
    title: "Scores",
    blocks: [
      { type: "scores", title: "Week", span: 7 },
      { type: "insights", title: "Patterns", span: 5 },
      { type: "history", title: "Last 8 weeks", span: 12 },
      { type: "ask", title: "Change a target", span: 12, props: { submit: "Save", template: "Set my weekly target {target} to {value} (settings.data.targets).",
        fields: [{ name: "target", type: "select", options: ["revision_minutes", "sets", "sleep_hours", "protein_g", "flashcard_reviews", "reading_pages", "chess_games", "language_reviews"] }, { name: "value", type: "text" }] } },
    ],
  },
  "stats--deep": {
    title: "Deep dives",
    subtitle: "Totals, averages, medians, records, trends, consistency, weekday and time-of-day patterns and distributions, computed in code. Switch the period on each.",
    blocks: [
      { type: "deepstats", title: "Revision minutes", span: 12, props: { table: "study_sessions", field: "minutes", unit: "min", groupBy: "subject" } },
      { type: "deepstats", title: "Flashcard reviews", span: 12, props: { table: "reviews", groupBy: "deck" } },
      { type: "deepstats", title: "Training volume per set", span: 12, props: { table: "sets", field: "volume", unit: "kg", groupBy: "exercise" } },
      { type: "deepstats", title: "Sleep", span: 12, props: { table: "sleep_logs", field: "hours", unit: "h" } },
      { type: "deepstats", title: "Protein per meal", span: 12, props: { table: "meals", field: "protein_g", unit: "g" } },
      { type: "deepstats", title: "Calories per meal", span: 12, props: { table: "meals", field: "kcal", unit: "kcal" } },
      { type: "deepstats", title: "Screen time", span: 12, props: { table: "screentime_days", field: "minutes", unit: "min", better: "lower" } },
      { type: "deepstats", title: "Past-paper scores", span: 12, props: { table: "past_papers", field: "pct", unit: "%", groupBy: "subject" } },
      { type: "deepstats", title: "Reading", span: 12, props: { table: "reading_logs", field: "pages", unit: "pages", groupBy: "book" } },
      { type: "deepstats", title: "Reaction time", span: 12, props: { table: "brain_test_results", field: "score", unit: "ms", better: "lower", where: { test: "reaction" } } },
      { type: "deepstats", title: "Chess rating (synced games)", span: 12, props: { table: "chess_games", field: "rating", groupBy: "time_class" } },
      { type: "deepstats", title: "Practice poker (big blinds per hand)", span: 12, props: { table: "poker_practice", field: "net_bb", unit: "bb" } },
      { type: "deepstats", title: "Energy (check-ins)", span: 12, props: { table: "checkins", field: "energy", unit: "/5" } },
      { type: "deepstats", title: "Apollo tokens in", span: 12, props: { table: "usage_log", field: "tokens_in", better: "lower", groupBy: "feature" } },
    ],
  },
  "stats--usage": {
    title: "Apollo usage",
    subtitle: "Live plan percentages are in the Apollo panel (Ctrl/Cmd+K → Apollo panel).",
    blocks: [
      { type: "stat", title: "Tokens out, 7 days", span: 4, bind: { table: "usage_log", days: 7, agg: { fn: "sum", field: "tokens_out", by: "day" } } },
      { type: "stat", title: "Tokens in, 7 days", span: 4, bind: { table: "usage_log", days: 7, agg: { fn: "sum", field: "tokens_in", by: "day" } } },
      { type: "donut", title: "By model, 30 days", span: 4, bind: { table: "usage_log", days: 30, agg: { fn: "count", by: { field: "model" } } } },
      { type: "bar", title: "By feature, 30 days (tokens in)", span: 12, bind: { table: "usage_log", days: 30, agg: { fn: "sum", field: "tokens_in", by: { field: "feature" } } } },
      { type: "table", title: "Recent", span: 12, bind: { table: "usage_log", limit: 20 }, props: { columns: ["created_at", "feature", "model", "tokens_in", "tokens_out"] } },
    ],
  },

  /* ======================= inbox ======================= */
  inbox: {
    title: "Inbox",
    blocks: [
      { type: "inbox", title: "Unread", span: 8, bind: { table: "inbox_items", where: { read_at: null }, limit: 50 } },
      { type: "agenda", title: "Due", span: 4, props: { days: 30 } },
      { type: "donut", title: "By source, 30 days", span: 4, bind: { table: "inbox_items", days: 30, agg: { fn: "count", by: { field: "source" } } } },
      { type: "inbox", title: "Everything", span: 8, bind: { table: "inbox_items", limit: 40 } },
    ],
  },
};
