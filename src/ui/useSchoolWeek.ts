"use client";
import { useEffect, useState } from "react";
import { DEFAULT_WEEK_A_ANCHOR, weekOf, type Wk } from "@/core/schoolWeek";

/** The current timetable week (A/B), from the server's anchor setting (computed locally until it loads). */
let cached: { anchor: string; current: Wk } | null = null;
export function useSchoolWeek() {
  const [w, setW] = useState<{ anchor: string; current: Wk } | null>(cached);
  useEffect(() => {
    if (cached) return;
    fetch("/api/school-week").then((r) => (r.ok ? r.json() : null)).then((j) => { cached = j?.current ? j : { anchor: DEFAULT_WEEK_A_ANCHOR, current: weekOf(new Date()) }; setW(cached); })
      .catch(() => setW({ anchor: DEFAULT_WEEK_A_ANCHOR, current: weekOf(new Date()) }));
  }, []);
  return w;
}
