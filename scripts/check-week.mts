import { weekOf } from "../src/core/schoolWeek";
for (const d of ["2026-11-09", "2026-11-13", "2026-11-15", "2026-11-16", "2026-11-22", "2026-11-23", "2026-11-30", "2026-12-07"]) console.log(d, weekOf(new Date(d + "T12:00:00Z")));
console.log("anchor moved to 2026-11-23:", weekOf(new Date("2026-11-16T12:00:00Z"), "2026-11-23"));
