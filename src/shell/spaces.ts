// The spaces and their thin-line icons (24x24, 1.5 stroke). Pure data: Apollo can reorder it later.

export type Space = { id: string; name: string; icon: string; blurb: string };

export const ICONS = {
  home: "M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18z M12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z",
  school: "M4 6.5c2.5-1 5.5-1 8 .5c2.5-1.5 5.5-1.5 8-.5v11c-2.5-1-5.5-1-8 .5c-2.5-1.5-5.5-1.5-8-.5z M12 7v11",
  fitness: "M6.5 12h11 M6.5 7.5v9 M17.5 7.5v9 M3.5 10v4 M20.5 10v4",
  nutrition: "M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5z",
  projects: "M4 8l8-4l8 4l-8 4z M4 12l8 4l8-4 M4 16l8 4l8-4",
  mind: "M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z M12 8.5v7 M8.5 12h7",
  languages: "M4 5.5h9 M8.5 3.5v2 M5.5 5.5c.5 4 3 6.5 6.5 8 M11.5 5.5c-.5 3.5-3 6.5-7 8 M13 20l4-9l4 9 M14.5 17h5",
  library: "M5 4v16 M9 4v16 M13 5l5 14.5 M3 20h18",
  stats: "M5 20V11 M10 20V4 M15 20v-7 M20 20V8",
  inbox: "M3 13l3-8h12l3 8v6H3z M3 13h5l1.5 3h5L16 13h5",
  chats: "M4 5h16v11H10l-5 4v-4H4z",
  style: "M12 3a9 9 0 1 0 0 18z M12 3a9 9 0 0 1 0 18 M12 7.5a4.5 4.5 0 0 1 0 9",
  panel: "M4 5h16v14H4z M4 9h16",
  orb: "M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M5 12c2.5-4 4.5-4 7 0s4.5 4 7 0",
  pin: "M9 4h6l-1 6l3 3H7l3-3z M12 13v7",
  close: "M6 6l12 12 M18 6L6 18",
  ask: "M5 12h13 M13 7l5 5l-5 5",
} as const;

export type IconName = keyof typeof ICONS;

export const SPACES: Space[] = [
  { id: "school", name: "School", icon: "school", blurb: "Revision hub, tutor, OneNote, opportunities" },
  { id: "fitness", name: "Fitness", icon: "fitness", blurb: "Training, progress, recovery" },
  { id: "nutrition", name: "Nutrition and sleep", icon: "nutrition", blurb: "Meals, recipes, sleep, screen time" },
  { id: "projects", name: "Projects", icon: "projects", blurb: "Status, notes, links, files, a chat per project" },
  { id: "mind", name: "Mind sports", icon: "mind", blurb: "Chess, poker, geography, brain tests, memory, programming" },
  { id: "languages", name: "Languages", icon: "languages", blurb: "Mandarin, Spanish, French, English" },
  { id: "library", name: "Library", icon: "library", blurb: "Books, journal, files, weekly reports" },
  { id: "stats", name: "Stats", icon: "stats", blurb: "Scores computed from your logs" },
  { id: "inbox", name: "Inbox", icon: "inbox", blurb: "Teams, OneNote, deadlines, reports" },
  { id: "chats", name: "Chats", icon: "chats", blurb: "Saved conversations with Apollo" },
];

export const getSpace = (id: string) => SPACES.find((s) => s.id === id);
