import { Chess } from "chess.js";
import { THEORY } from "../src/chess/theory.ts";
import { OPENINGS } from "../src/chess/openings.ts";
let bad = 0;
for (const [id, lines] of Object.entries(THEORY)) {
  if (!OPENINGS.find((o) => o.id === id)) { console.log("unknown opening", id); bad++; }
  for (const l of lines) { const g = new Chess(); for (const m of l.line.split(" ")) { try { g.move(m); } catch { console.log(id, l.name, "illegal:", m); bad++; break; } } }
}
for (const o of OPENINGS) if (!THEORY[o.id]) console.log("no theory", o.id);
console.log("bad", bad);
