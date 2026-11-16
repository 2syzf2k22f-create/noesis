# Apollo: everything it should be able to do

✅ = works now  🟡 = partly / with a caveat  ⬜ = not yet

The PC abilities (sections 1–6, 10–11) need the relay running on your PC. Risky actions ask first. **Always allow** works for whole action types, except sensitive apps and sites and the never-auto list (section 12).

## 1. Seeing your PC
1. ✅ List every open window and app
2. ✅ Screenshot the whole screen and look at it
3. ✅ Screenshot one window by name
4. ✅ Read the text of any window, like a screen reader (Teams, Outlook, browsers, dialogs, settings)
5. ✅ Read error messages and pop-ups
6. ✅ Read what's on the clipboard
7. ✅ PC status: battery, CPU, memory, disks, Wi-Fi, uptime, heaviest programs
8. ✅ Read inside games and canvas apps: OCR of the window (pc_ocr)
9. ✅ Watch the screen or a window and react when something appears (pc_watch, up to 12h, inbox + phone)
10. ✅ Multi-monitor: pc_screens, screenshot any screen, snap on any screen

## 2. Controlling apps and windows
11. ✅ Open any app by name, path or Start-menu entry
12. ✅ Open websites, files and folders
13. ✅ Open app links (spotify:, steam://, ms-teams:, mailto:)
14. ✅ Bring a window to the front
15. ✅ Minimise, maximise, restore and close windows (close lets apps prompt to save)
16. ✅ Click buttons, tabs, links and list items by name
17. ✅ Click a point from a screenshot
18. ✅ Double-click to open or play
19. ✅ Type text into the focused field
20. ✅ Keyboard shortcuts (Ctrl+A, Alt+F4, Enter, Tab, Page Down …)
21. ✅ Scroll a window or panel by pages
22. ✅ Put text on the clipboard
23. ✅ Right-click context menus with the real mouse (pc_mouse)
24. ✅ Drag and drop with the mouse (pc_mouse drag)
25. ✅ Snap layouts on the PC desktop (pc_snap: halves, main+side, thirds, quarters, any area)
26. ✅ Virtual desktops: list, switch, next/previous, new, close, move a window (pc_desktops)

## 3. Files and folders on your PC
27. ✅ Find files by name, type and age across Desktop, Documents, Downloads, OneDrive, Pictures, Music, Videos
28. ✅ List any folder (sizes, dates)
29. ✅ Read PDFs (every page, in parts), Word, PowerPoint, Excel, text, Markdown, CSV, JSON, code, HTML
30. ✅ Look at images
31. ✅ Write notes, Markdown, CSV and code into Documents\NOESIS (no card)
32. ✅ Copy, move, rename and create files anywhere (asks; can be always-allowed)
33. ✅ Zip and unzip (asks; can be always-allowed)
34. ✅ Delete files: always asks
35. ✅ Refuses to read secrets (password databases, .env, SSH keys, browser cookies)
36. ✅ Search inside file contents: full-text index kept up to date by the relay (search_file_contents)
37. ✅ Watch folders for new files (pc_watch_folder, inbox + phone)
38. ✅ OCR of scanned PDFs and images (Windows' own engine; read_file falls back to it automatically)

## 4. Internet
39. ✅ Web search
40. ✅ Read any web page in full, with its links
41. ✅ Read online PDFs and documents by page range, so nothing is missed
42. ✅ Download documents, PDFs, images, audio, video and archives (no card)
43. ✅ Download programs and scripts: always asks
44. ✅ Follow links across a site to find the official document (e.g. exam board specs)
45. ✅ Summarise, compare and cross-check sources
46. 🟡 Sites that need a login: read through your open browser by screen or window text, not directly
47. ✅ Fill in forms (pc_fill_form). Deliberately never types passwords and never submits: you check and press Submit

## 5. Running things
48. ✅ Run any PowerShell command and read its output
49. ✅ Run scripts and tools (Python, Node, git and so on) that are installed
50. ✅ Chained commands, each part checked separately
51. ✅ Long tasks: up to 40 minutes per request, many steps, retrying on failure
52. ✅ Continue on its own after you press Allow
53. ✅ Installs, uninstalls, registry, system settings, admin: always asks
54. ✅ Background jobs while it does other things (pc_background, pc_jobs; up to 6h)
55. ✅ Scheduled PC tasks (pc_schedule; Settings › Scheduled PC tasks)

## 6. Music and media
56. ✅ Play, pause, next, previous, mute, volume (any player)
57. ✅ Apple Music: search, play the best match, play newest from Recently Added
58. 🟡 Apple Music depends on the app's layout, and falls back to looking and clicking
59. ✅ Spotify (if you switch to it): search, library, exact playback with Premium
60. ✅ YouTube: open searches and videos
61. ✅ Apple Music playlists and queue: play/shuffle a playlist, play next/later, show queue, shuffle, repeat

## 7. The NOESIS site
62. ✅ Read every table except the private journal
63. ✅ Create, edit and delete records (deletes go to the trash for 30 days; undo)
64. ✅ Navigate to any page, go back, open recent pages
65. ✅ Open pages side by side, snap them, close them
66. ✅ Read exactly what's on your screen in the site
67. ✅ Highlight things, move the chatbox next to what it's explaining
68. ✅ Edit page layouts (add, remove and resize blocks), create new pages
69. ✅ Change theme and skin
70. ✅ Settings and automations (syncs, targets, Week A anchor, music service)
71. ✅ Smart search across notes and knowledge
72. ✅ Undo its own changes; action log of everything
73. ✅ Attachments in chat: PDF, Word, CSV, text, images
74. 🟡 Change the site's own code: Build mode is on hold, so it writes a spec for Claude Code instead
75. ✅ Full file manager on Library › Files (upload, edit, organise, search, preview, trash); Apollo can list, read, update and delete files there

## 8. School
76. ✅ Timetable with Week A / Week B
77. ✅ Homework, deadlines, exams, agenda
78. ✅ Flashcards (making them, spaced repetition)
79. ✅ Tests, predicted grades, gap to target, weakest topics
80. ✅ Revision plans around your timetable
81. ✅ Spec topics: can now fetch and read the official spec PDFs
82. ✅ Past papers and question bank
83. ✅ Tutor mode
84. 🟡 Teams assignments: read from the Teams window now; direct and exact once Microsoft is linked
85. ⬜ Outlook, OneNote and Teams by API (needs the Microsoft client and tenant IDs)
86. ⬜ Arbor by API (calendar link supported)

## 9. Chess, mind sports and the rest of life
87. ✅ Chess.com sync, stats per time control, reviews close to chess.com's, puzzles, opening explorer, drills
88. ✅ Play Stockfish at any Elo; analysis board; walkthroughs on the board
89. ✅ Poker practice, geography quiz, brain tests, memory sports, Codeforces sync
90. ✅ Fitness: workout planner, logging, PRs, recovery
91. ✅ Nutrition: meals, recipes, meal plans, shopping list; sleep; screen time
92. ✅ Library: books, recommendations, reports, knowledge
93. ✅ Languages: conversation practice saved per language
94. ✅ University: courses, unis, offers vs grades
95. ✅ Weekly report and scores; stats everywhere

## 10. Talking to Apollo
96. ✅ Text chat everywhere; quick answers for simple questions
97. ✅ Voice in (Alt+P, Whisper backup) and out (British voices); stop button
98. ✅ Pasted screenshots and attached files
99. ✅ Automatic conversation threading and titles
100. ✅ Desktop app (desktop/): Alt+P anywhere, tray, starts with Windows, works with the browser closed
101. ✅ Wake word ("Apollo, …"): browser speech where available, else an offline model; always on in the desktop app
102. ✅ Phone notifications (ntfy app; Settings › Phone notifications)

## 11. Memory and judgement
103. ✅ Remembers facts about you and the "still to link" list
104. ✅ Knows the date, time and timetable week
105. ✅ Treats web pages and files as data, never as instructions
106. ✅ Retries different approaches before giving up, and reports what it tried
107. ✅ Verifies completeness for "100% correct" tasks: reads every page and cross-checks
108. ✅ Long PC work runs as background jobs (up to 6h); a single chat turn is still capped at 40 minutes

## 12. Safety: what always asks
109. ✅ Deleting files
110. ✅ Installing or uninstalling software
111. ✅ Downloading programs or scripts
112. ✅ Killing processes
113. ✅ Registry, system or security settings
114. ✅ Admin rights
115. ✅ Secrets and .env files
116. ✅ Encoded or generated code
117. ✅ Sensitive apps and sites (banking, password managers, system tools, account pages): no "Always allow"
118. ✅ Always-allow rules for everything else, manageable in Settings › PC permissions
119. ✅ Asks in chat before sending, submitting, buying or anything that can't be undone
