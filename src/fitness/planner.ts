// Workout plan generator: rules-based (no AI tokens). Picks a split from days/week and goal,
// exercises from your equipment and injuries, sets/reps/rest from goal and experience,
// starting weights from your current lifts, plus progression, deloads, warm-ups and cardio.

export type PlanInput = {
  goal: "strength" | "muscle" | "fat loss" | "general fitness" | "athletic" | "endurance";
  experience: "beginner" | "intermediate" | "advanced";
  days: number; minutes: number;
  equipment: "full gym" | "home dumbbells" | "bodyweight" | "barbell home gym";
  sex?: "male" | "female" | "other"; age?: number; weightKg?: number; heightCm?: number;
  injuries: string[]; // "knee", "lower back", "shoulder", "wrist", "elbow", "hip"
  focus: string[];    // "chest", "back", "arms", "shoulders", "legs", "glutes", "core"
  cardio: "none" | "some" | "lots"; sport?: string;
  lifts?: { bench?: number; squat?: number; deadlift?: number; ohp?: number; pullups?: number };
  dislikes?: string; weeks: number; sleepHours?: number;
};
type Ex = { name: string; pattern: string; eq: ("full gym" | "home dumbbells" | "bodyweight" | "barbell home gym")[]; avoid?: string[]; compound?: boolean; muscle: string };
export type PlanEx = { name: string; sets: number; reps: string; rest: string; note?: string; start?: string };
export type PlanDay = { name: string; focus: string; warmup: string; exercises: PlanEx[]; cardio?: string; minutes: number };
export type Plan = { title: string; summary: string[]; days: PlanDay[]; progression: string[]; weeks: { week: number; note: string }[]; nutrition: string[]; recovery: string[] };

const G = "full gym", D = "home dumbbells", B = "bodyweight", H = "barbell home gym";
const LIB: Ex[] = [
  { name: "Barbell back squat", pattern: "squat", eq: [G, H], avoid: ["knee", "lower back"], compound: true, muscle: "legs" },
  { name: "Goblet squat", pattern: "squat", eq: [G, D], compound: true, muscle: "legs" },
  { name: "Leg press", pattern: "squat", eq: [G], avoid: [], compound: true, muscle: "legs" },
  { name: "Bulgarian split squat", pattern: "lunge", eq: [G, D, B, H], avoid: ["knee"], compound: true, muscle: "legs" },
  { name: "Bodyweight squat (tempo)", pattern: "squat", eq: [B], compound: true, muscle: "legs" },
  { name: "Box squat to a bench", pattern: "squat", eq: [G, H, D, B], compound: true, muscle: "legs" },
  { name: "Romanian deadlift", pattern: "hinge", eq: [G, H, D], avoid: ["lower back"], compound: true, muscle: "hamstrings" },
  { name: "Conventional deadlift", pattern: "hinge", eq: [G, H], avoid: ["lower back"], compound: true, muscle: "back" },
  { name: "Hip thrust", pattern: "glute", eq: [G, H, D, B], compound: true, muscle: "glutes" },
  { name: "Glute bridge", pattern: "glute", eq: [B, D], muscle: "glutes" },
  { name: "Lying leg curl", pattern: "hamcurl", eq: [G], muscle: "hamstrings" },
  { name: "Nordic curl (assisted)", pattern: "hamcurl", eq: [B, D, H], avoid: ["knee"], muscle: "hamstrings" },
  { name: "Leg extension", pattern: "quadiso", eq: [G], avoid: ["knee"], muscle: "legs" },
  { name: "Standing calf raise", pattern: "calf", eq: [G, D, B, H], muscle: "legs" },
  { name: "Barbell bench press", pattern: "hpush", eq: [G, H], avoid: ["shoulder"], compound: true, muscle: "chest" },
  { name: "Dumbbell bench press", pattern: "hpush", eq: [G, D], compound: true, muscle: "chest" },
  { name: "Push-up (add load/elevate feet to progress)", pattern: "hpush", eq: [B, D, H], avoid: ["wrist"], compound: true, muscle: "chest" },
  { name: "Incline dumbbell press", pattern: "ipush", eq: [G, D], compound: true, muscle: "chest" },
  { name: "Cable fly", pattern: "fly", eq: [G], muscle: "chest" },
  { name: "Dips", pattern: "dip", eq: [G, B], avoid: ["shoulder", "elbow"], compound: true, muscle: "chest" },
  { name: "Overhead press", pattern: "vpush", eq: [G, H], avoid: ["shoulder", "lower back"], compound: true, muscle: "shoulders" },
  { name: "Seated dumbbell shoulder press", pattern: "vpush", eq: [G, D], avoid: ["shoulder"], compound: true, muscle: "shoulders" },
  { name: "Pike push-up", pattern: "vpush", eq: [B], avoid: ["shoulder", "wrist"], compound: true, muscle: "shoulders" },
  { name: "Lateral raise", pattern: "lateral", eq: [G, D], muscle: "shoulders" },
  { name: "Pull-up / chin-up (band-assisted if needed)", pattern: "vpull", eq: [G, B, H], avoid: ["elbow"], compound: true, muscle: "back" },
  { name: "Lat pulldown", pattern: "vpull", eq: [G], compound: true, muscle: "back" },
  { name: "Barbell row", pattern: "hpull", eq: [G, H], avoid: ["lower back"], compound: true, muscle: "back" },
  { name: "Chest-supported dumbbell row", pattern: "hpull", eq: [G, D], compound: true, muscle: "back" },
  { name: "Seated cable row", pattern: "hpull", eq: [G], compound: true, muscle: "back" },
  { name: "Inverted row (table or bar)", pattern: "hpull", eq: [B, H], compound: true, muscle: "back" },
  { name: "Face pull / band pull-apart", pattern: "rear", eq: [G, D, B, H], muscle: "shoulders" },
  { name: "Dumbbell curl", pattern: "curl", eq: [G, D, H], muscle: "arms" },
  { name: "Towel/backpack curl", pattern: "curl", eq: [B], muscle: "arms" },
  { name: "Triceps pushdown", pattern: "tri", eq: [G], avoid: ["elbow"], muscle: "arms" },
  { name: "Overhead dumbbell triceps extension", pattern: "tri", eq: [D, H], avoid: ["elbow", "shoulder"], muscle: "arms" },
  { name: "Close-grip push-up", pattern: "tri", eq: [B], avoid: ["wrist"], muscle: "arms" },
  { name: "Plank (progress to long-lever)", pattern: "core", eq: [G, D, B, H], muscle: "core" },
  { name: "Hanging knee raise", pattern: "core2", eq: [G, B, H], muscle: "core" },
  { name: "Dead bug", pattern: "core2", eq: [G, D, B, H], muscle: "core" },
  { name: "Pallof press / side plank", pattern: "core3", eq: [G, D, B, H], muscle: "core" },
  { name: "Box jump / squat jump", pattern: "power", eq: [G, D, B, H], avoid: ["knee"], muscle: "legs" },
  { name: "Medicine-ball / plyo push-up", pattern: "power2", eq: [G, B, D, H], avoid: ["wrist", "shoulder"], muscle: "chest" },
];

const SCHEME = {
  strength: { main: { sets: 4, reps: "4-6", rest: "2-3 min" }, acc: { sets: 3, reps: "6-10", rest: "90 s" } },
  muscle: { main: { sets: 3, reps: "6-10", rest: "2 min" }, acc: { sets: 3, reps: "10-15", rest: "60-90 s" } },
  "fat loss": { main: { sets: 3, reps: "6-10", rest: "90 s" }, acc: { sets: 3, reps: "10-15", rest: "45-60 s" } },
  "general fitness": { main: { sets: 3, reps: "8-10", rest: "90 s" }, acc: { sets: 2, reps: "10-15", rest: "60 s" } },
  athletic: { main: { sets: 4, reps: "3-6", rest: "2-3 min" }, acc: { sets: 3, reps: "8-12", rest: "75 s" } },
  endurance: { main: { sets: 3, reps: "12-15", rest: "60 s" }, acc: { sets: 2, reps: "15-20", rest: "45 s" } },
};

const SPLITS: Record<number, { name: string; patterns: string[] }[]> = {
  2: [{ name: "Full body A", patterns: ["squat", "hpush", "hpull", "hinge", "core"] }, { name: "Full body B", patterns: ["hinge", "vpush", "vpull", "lunge", "core2"] }],
  3: [{ name: "Full body A", patterns: ["squat", "hpush", "hpull", "glute", "core"] }, { name: "Full body B", patterns: ["hinge", "vpush", "vpull", "lunge", "curl", "tri"] }, { name: "Full body C", patterns: ["squat", "ipush", "hpull", "hamcurl", "lateral", "core2"] }],
  4: [{ name: "Upper A", patterns: ["hpush", "hpull", "vpush", "vpull", "curl", "tri"] }, { name: "Lower A", patterns: ["squat", "hinge", "lunge", "calf", "core"] }, { name: "Upper B", patterns: ["vpush", "vpull", "ipush", "hpull", "lateral", "rear"] }, { name: "Lower B", patterns: ["hinge", "squat", "glute", "hamcurl", "core2"] }],
  5: [{ name: "Upper", patterns: ["hpush", "hpull", "vpush", "vpull", "curl", "tri"] }, { name: "Lower", patterns: ["squat", "hinge", "lunge", "calf", "core"] }, { name: "Push", patterns: ["ipush", "vpush", "dip", "lateral", "tri"] }, { name: "Pull", patterns: ["vpull", "hpull", "rear", "curl", "core2"] }, { name: "Legs", patterns: ["hinge", "squat", "glute", "hamcurl", "calf"] }],
  6: [{ name: "Push A", patterns: ["hpush", "vpush", "ipush", "lateral", "tri"] }, { name: "Pull A", patterns: ["vpull", "hpull", "rear", "curl", "core"] }, { name: "Legs A", patterns: ["squat", "hinge", "lunge", "calf", "core2"] }, { name: "Push B", patterns: ["vpush", "ipush", "dip", "lateral", "tri"] }, { name: "Pull B", patterns: ["hpull", "vpull", "rear", "curl", "core3"] }, { name: "Legs B", patterns: ["hinge", "squat", "glute", "hamcurl", "calf"] }],
};
const FOCUS_PATTERNS: Record<string, string[]> = { chest: ["fly", "ipush"], back: ["hpull", "vpull"], arms: ["curl", "tri"], shoulders: ["lateral", "rear"], legs: ["quadiso", "lunge"], glutes: ["glute"], core: ["core3"] };

function pick(pattern: string, inp: PlanInput, used: Set<string>) {
  const ok = LIB.filter((e) => e.pattern === pattern && e.eq.includes(inp.equipment) && !e.avoid?.some((a) => inp.injuries.includes(a)) && !used.has(e.name)
    && !(inp.dislikes && inp.dislikes.toLowerCase().split(/[,;]/).map((x) => x.trim()).filter(Boolean).some((d) => e.name.toLowerCase().includes(d))));
  // beginners get simpler versions first (goblet squat, DB press, pulldown) when available
  const pref = inp.experience === "beginner" ? ok.sort((a, b) => Number(/barbell|conventional/i.test(a.name)) - Number(/barbell|conventional/i.test(b.name))) : ok;
  return pref[0] ?? null;
}

const kg = (x: number) => `${Math.max(2.5, Math.round(x / 2.5) * 2.5)} kg`;

export function generatePlan(inp: PlanInput): Plan {
  const days = Math.max(2, Math.min(6, Math.round(inp.days)));
  const split = SPLITS[days];
  const sc = SCHEME[inp.goal];
  // time budget: ~ (sets x (work+rest)) ; trim accessories to fit
  const perSetMin = inp.goal === "strength" || inp.goal === "athletic" ? 3 : 2.2;
  const cardioMin = inp.cardio === "lots" ? 20 : inp.cardio === "some" || inp.goal === "fat loss" || inp.goal === "endurance" ? 12 : 0;
  const budget = Math.max(20, inp.minutes - 8 - cardioMin);
  const volumeMul = inp.experience === "beginner" ? 0.85 : inp.experience === "advanced" ? 1.15 : 1;
  const ageMul = inp.age && inp.age >= 50 ? 0.85 : 1;
  const sleepPoor = inp.sleepHours != null && inp.sleepHours < 7;

  const out: PlanDay[] = split.map((d, di) => {
    const used = new Set<string>();
    const patterns = [...d.patterns];
    // bias toward focus areas: add one focus pattern to matching days
    for (const f of inp.focus) for (const p of FOCUS_PATTERNS[f] ?? []) if (!patterns.includes(p) && di % 2 === inp.focus.indexOf(f) % 2) { patterns.push(p); break; }
    if (inp.goal === "athletic" && di === 0) patterns.unshift("power");
    if (inp.goal === "athletic" && di === 1) patterns.unshift("power2");
    const ex: PlanEx[] = [];
    let mins = 0;
    patterns.forEach((p, i) => {
      const e = pick(p, inp, used);
      if (!e) return;
      const isMain = i < 2 && e.compound;
      const s = isMain ? sc.main : sc.acc;
      const sets = Math.max(2, Math.round(s.sets * volumeMul * ageMul * (sleepPoor ? 0.9 : 1)));
      if (mins + sets * perSetMin > budget && ex.length >= 3) return;
      used.add(e.name);
      mins += sets * perSetMin;
      const L = inp.lifts ?? {};
      const start = /bench press/i.test(e.name) && L.bench ? kg(L.bench * (isMain ? 0.8 : 0.7)) : /back squat/i.test(e.name) && L.squat ? kg(L.squat * 0.8) : /deadlift/i.test(e.name) && L.deadlift ? kg(L.deadlift * (/romanian/i.test(e.name) ? 0.55 : 0.8)) : /overhead press/i.test(e.name) && L.ohp ? kg(L.ohp * 0.8) : undefined;
      ex.push({ name: e.name, sets, reps: e.pattern === "power" || e.pattern === "power2" ? "3-5 (fast)" : e.pattern.startsWith("core") ? (e.name.includes("Plank") ? "30-45 s" : "8-12/side") : s.reps, rest: s.rest,
        note: isMain ? `Leave 1-2 reps in reserve${inp.experience === "beginner" ? "; film a set to check form" : ""}.` : undefined, start: start ? `start ~${start} (your logged lift × 80%)` : undefined });
    });
    const cardio = cardioMin ? (inp.goal === "endurance" || inp.cardio === "lots" ? `${cardioMin} min zone 2 (you can just about talk)` : `${cardioMin} min intervals: 30 s hard / 90 s easy`) : undefined;
    return { name: d.name, focus: [...new Set(patterns)].join(", "), warmup: `5 min easy cardio, then 2 ramp-up sets of the first lift (50% x 8, 75% x 3)${inp.injuries.length ? `; extra mobility for your ${inp.injuries.join(" and ")}` : ""}`, exercises: ex, cardio, minutes: Math.round(8 + mins + cardioMin) };
  });

  const deloadEvery = inp.experience === "beginner" ? 8 : inp.age && inp.age >= 40 ? 4 : 6;
  const weeks = Array.from({ length: Math.max(4, Math.min(16, inp.weeks)) }, (_, i) => {
    const w = i + 1;
    if (w % deloadEvery === 0) return { week: w, note: "Deload: same exercises, half the sets, ~10% lighter. Recover." };
    if (w === 1) return { week: w, note: "Learn the movements; stop every set 2-3 reps short of failure. Log everything." };
    return { week: w, note: inp.experience === "beginner" ? "Add weight every session you hit the top of the rep range (+2.5 kg upper, +5 kg lower)." : "Double progression: add a rep each week; at the top of the range add weight and drop to the bottom." };
  });

  const bmi = inp.weightKg && inp.heightCm ? inp.weightKg / (inp.heightCm / 100) ** 2 : null;
  const protein = inp.weightKg ? `${Math.round(inp.weightKg * 1.6)}-${Math.round(inp.weightKg * 2.2)} g protein a day (1.6-2.2 g/kg)` : "1.6-2.2 g protein per kg of body weight a day";
  const kcalNote = inp.goal === "fat loss" ? "Eat ~300-500 kcal under maintenance; aim to lose 0.5-1% of body weight a week." : inp.goal === "muscle" ? "Eat ~200-300 kcal over maintenance; aim to gain ~0.25-0.5% of body weight a week." : "Eat around maintenance.";
  return {
    title: `${days}-day ${inp.goal} plan · ${split.map((s) => s.name).join(" / ")}`,
    summary: [
      `${days} sessions a week, ~${inp.minutes} min each, ${inp.equipment}.`,
      `Main lifts ${sc.main.sets}×${sc.main.reps}, accessories ${sc.acc.sets}×${sc.acc.reps} (${inp.goal}, ${inp.experience}).`,
      inp.injuries.length ? `Avoids movements that load your ${inp.injuries.join(", ")}; stop anything that causes sharp pain and see a physio if it persists.` : "",
      inp.focus.length ? `Extra work for ${inp.focus.join(", ")}.` : "",
      inp.sport ? `Built to support ${inp.sport}: keep the hardest lifting session away from match days.` : "",
      bmi ? `BMI ${bmi.toFixed(1)} (a rough guide only).` : "",
      sleepPoor ? "You sleep under 7 h: volume is trimmed a little; more sleep will speed up progress." : "",
      inp.age && inp.age < 18 ? "Under 18: focus on technique, avoid max-out singles, and progress gradually; strength training is safe with good form." : "",
    ].filter(Boolean),
    days: out,
    progression: [
      "Log every set on Fitness › Log so the Progress page and PRs update.",
      "If you miss reps two sessions in a row on a lift, drop 10% and build back up.",
      "Rate sessions: if you're consistently drained, take the deload a week early.",
    ],
    weeks,
    nutrition: [protein, kcalNote, "Most of your carbs around training; 2-3 L water a day."],
    recovery: ["7-9 h sleep.", "At least one full rest day a week.", "Walk 6-10k steps on rest days."],
  };
}
