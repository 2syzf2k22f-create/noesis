// Cards, hand evaluation (best 5 of 7) and Monte Carlo equity. Pure functions.
export type Card = string; // "As", "Td", "7c"
export const RANKS = "23456789TJQKA";
export const SUITS = "shdc";
export const fullDeck = (): Card[] => [...RANKS].flatMap((r) => [...SUITS].map((s) => r + s));
export const rv = (c: Card) => RANKS.indexOf(c[0]) + 2;
export function shuffled<T>(a: T[]) { const c = [...a]; for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; }

export const CATS = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];

/** Score of exactly 5 cards: higher is better; comparable as numbers. */
function score5(cs: Card[]): number {
  const v = cs.map(rv).sort((a, b) => b - a);
  const flush = cs.every((c) => c[1] === cs[0][1]);
  const uniq = [...new Set(v)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (v[0] - v[4] === 4) straightHigh = v[0];
    else if (v[0] === 14 && v[1] === 5) straightHigh = 5; // wheel
  }
  const counts = new Map<number, number>();
  for (const x of v) counts.set(x, (counts.get(x) ?? 0) + 1);
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kick = (xs: number[]) => xs.reduce((acc, x) => acc * 15 + x, 0);
  let cat: number, tb: number[];
  if (straightHigh && flush) { cat = 8; tb = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = 7; tb = [groups[0][0], groups[1][0]]; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 6; tb = [groups[0][0], groups[1][0]]; }
  else if (flush) { cat = 5; tb = v; }
  else if (straightHigh) { cat = 4; tb = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = 3; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; tb = groups.map((g) => g[0]); }
  else if (groups[0][1] === 2) { cat = 1; tb = groups.map((g) => g[0]); }
  else { cat = 0; tb = v; }
  while (tb.length < 5) tb.push(0);
  return cat * 15 ** 5 + kick(tb);
}

/** Best 5-card score from 5-7 cards. */
export function best(cs: Card[]): number {
  if (cs.length === 5) return score5(cs);
  let b = -1;
  const n = cs.length;
  for (let a = 0; a < n; a++) for (let c = a + 1; c < n; c++) {
    const five = cs.filter((_, i) => i !== a && i !== c);
    if (five.length === 5) b = Math.max(b, score5(five));
    else if (five.length === 6) b = Math.max(b, best(five));
  }
  return b;
}
export const category = (score: number) => CATS[Math.floor(score / 15 ** 5)];

/** Probability of winning (ties split) against `opponents` random hands. */
export function equity(hole: Card[], board: Card[], opponents: number, sims = 250): number {
  const known = new Set([...hole, ...board]);
  const deck = fullDeck().filter((c) => !known.has(c));
  let win = 0;
  for (let s = 0; s < sims; s++) {
    const d = shuffled(deck);
    let k = 0;
    const opp: Card[][] = [];
    for (let o = 0; o < opponents; o++) opp.push([d[k++], d[k++]]);
    const full = [...board];
    while (full.length < 5) full.push(d[k++]);
    const me = best([...hole, ...full]);
    let bestOpp = -1, ties = 0;
    for (const h of opp) { const sc = best([...h, ...full]); if (sc > bestOpp) { bestOpp = sc; ties = 0; } if (sc === bestOpp) ties++; }
    if (me > bestOpp) win += 1;
    else if (me === bestOpp) win += 1 / (ties + 1);
  }
  return win / sims;
}
