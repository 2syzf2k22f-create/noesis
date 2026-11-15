// Built-in review decks that have no table of their own: poker (preflop ranges, pot odds, outs: every
// answer is computed here, not typed) and coding (core algorithm patterns and complexities).

export type BuiltinCard = { id: string; deck: string; topic: string; front: string; back: string };

const R = "AKQJT98765432";
const rv = (c: string) => R.length - R.indexOf(c);
/** Expand range notation like "77+", "ATs+", "A5s", "KQo", "K9o+" into a set of hand labels. */
function expand(spec: string): Set<string> {
  const out = new Set<string>();
  for (const tok of spec.split(",").map((x) => x.trim()).filter(Boolean)) {
    const plus = tok.endsWith("+"), t = plus ? tok.slice(0, -1) : tok;
    if (t.length === 2 && t[0] === t[1]) { for (const c of R) if (rv(c) >= rv(t[0]) && (plus || c === t[0])) out.add(c + c); continue; }
    const [hi, lo, sfx] = [t[0], t[1], t[2]];
    for (const c of R) if (rv(c) < rv(hi) && (plus ? rv(c) >= rv(lo) : c === lo)) out.add(hi + c + sfx);
  }
  return out;
}
// A standard 6-max opening (raise-first-in) chart, tight-aggressive.
const OPEN: Record<string, string> = {
  UTG: "77+, ATs+, KTs+, QTs+, JTs, AJo+, KQo",
  HJ: "66+, A9s+, A5s, KTs+, QTs+, JTs, T9s, ATo+, KJo+",
  CO: "44+, A2s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, ATo+, KTo+, QJo",
  BTN: "22+, A2s+, K5s+, Q8s+, J8s+, T8s+, 97s+, 86s+, 76s, 65s, A7o+, A5o, K9o+, Q9o+, J9o+, T9o",
  SB: "33+, A2s+, K7s+, Q9s+, J9s+, T9s, 98s, A8o+, KTo+, QJo",
};
const SAMPLE = ["AA", "TT", "66", "33", "AKo", "AJo", "A9o", "A5s", "A2s", "KQs", "KJo", "KTo", "K9s", "K6s", "QJs", "QTo", "Q9s", "JTs", "J9s", "T9s", "98s", "87s", "76s", "65s", "A7o", "K9o", "J8s"];

function poker(): BuiltinCard[] {
  const cards: BuiltinCard[] = [];
  for (const [pos, spec] of Object.entries(OPEN)) {
    const range = expand(spec);
    for (const h of SAMPLE) {
      const yes = range.has(h);
      cards.push({ id: `open:${pos}:${h}`, deck: "Poker", topic: `Preflop · ${pos}`, front: `6-max, folded to you in the **${pos}** (100bb). You hold **${h}**. Open-raise or fold?`, back: `**${yes ? "Raise" : "Fold"}.** ${pos} opens: ${spec}.` });
    }
  }
  // pot odds: equity needed to call = bet / (pot + 2 × bet)
  for (const [pot, bet] of [[100, 50], [100, 100], [100, 33], [100, 75], [60, 20], [200, 150], [80, 80], [150, 50]]) {
    const need = Math.round((bet / (pot + 2 * bet)) * 1000) / 10;
    cards.push({ id: `odds:${pot}:${bet}`, deck: "Poker", topic: "Pot odds", front: `Pot is **${pot}**, villain bets **${bet}**. What equity do you need to call?`, back: `**${need}%**: call ${bet} to win ${pot + 2 * bet} → ${bet} ÷ ${pot + 2 * bet}.` });
  }
  // outs: exact odds to hit by the river from the flop (2 cards to come, 47 unseen) and on the turn (1 card, 46 unseen)
  for (const [name, outs] of [["flush draw", 9], ["open-ended straight draw", 8], ["gutshot", 4], ["flush draw + open-ender", 15], ["two overcards", 6], ["set from a pair (to hit trips)", 2], ["flush draw + gutshot", 12]] as [string, number][]) {
    const river = Math.round((1 - ((47 - outs) / 47) * ((46 - outs) / 46)) * 1000) / 10, turn = Math.round((outs / 47) * 1000) / 10;
    cards.push({ id: `outs:${outs}:${name}`, deck: "Poker", topic: "Outs", front: `On the flop with a **${name}**: how many outs, and your chance to hit by the river?`, back: `**${outs} outs.** Next card ${turn}%, by the river ${river}% (rule of 4 says ~${outs * 4}%).` });
  }
  return cards;
}

const CODING: [string, string, string][] = [
  ["Complexity", "Binary search: time complexity, and the precondition?", "O(log n); the array must be sorted (or the predicate monotonic)."],
  ["Complexity", "Merge sort: time, extra space, stable?", "O(n log n) always; O(n) extra space; stable."],
  ["Complexity", "Quicksort: average and worst case?", "Average O(n log n); worst O(n²) with bad pivots (sorted input + first-element pivot). Randomise the pivot."],
  ["Complexity", "Heap push/pop and building a heap from n items?", "Push/pop O(log n); heapify all n items O(n)."],
  ["Complexity", "Hash map lookup: average and worst?", "Average O(1); worst O(n) when everything collides."],
  ["Complexity", "BFS / DFS on a graph with V vertices and E edges?", "O(V + E) time, O(V) space."],
  ["Complexity", "Dijkstra with a binary heap?", "O((V + E) log V). Needs non-negative edge weights."],
  ["Complexity", "Bellman–Ford: complexity and what it handles that Dijkstra can't?", "O(V·E); negative edges, and detects negative cycles (an update on pass V)."],
  ["Complexity", "Floyd–Warshall?", "O(V³) all-pairs shortest paths; dp[k][i][j] using vertices ≤ k as intermediates."],
  ["Complexity", "Union-Find with path compression + union by rank?", "Near O(1) per operation: O(α(n)), inverse Ackermann."],
  ["Complexity", "Rough operations per second to aim for in competitive programming?", "About 10⁸ simple ops/s: n ≤ 10⁵ wants O(n log n), n ≤ 5000 allows O(n²), n ≤ 20 allows O(2ⁿ)."],
  ["Patterns", "Two pointers: when do you use it?", "Sorted arrays / pairs with a target sum, removing duplicates, merging; O(n) instead of O(n²)."],
  ["Patterns", "Sliding window: when?", "Contiguous subarray/substring with a constraint (longest/shortest with sum ≤ k, at most k distinct). Grow right, shrink left."],
  ["Patterns", "Prefix sums: what do they give you?", "Range sums in O(1) after O(n) setup: sum(l..r) = P[r+1] − P[l]. 2D version for rectangles."],
  ["Patterns", "Monotonic stack: classic use?", "Next greater/smaller element, largest rectangle in a histogram; each element pushed and popped once, O(n)."],
  ["Patterns", "Binary search on the answer: when?", "When 'can we do it with x?' is monotonic in x (min max, capacity, time). Search x, check in O(n)."],
  ["Patterns", "Topological sort: algorithm and use?", "Kahn's (repeatedly remove in-degree 0) or DFS post-order reversed; orders a DAG, detects cycles."],
  ["Patterns", "Bit tricks: lowest set bit, and test bit i?", "x & −x gives the lowest set bit; (x >> i) & 1 tests bit i. Subsets of a mask: s = (s − 1) & mask."],
  ["DP", "The 4 steps to write a DP?", "State, transition (recurrence), base cases, order of evaluation (or memoise). Then check the answer cell."],
  ["DP", "0/1 knapsack: state and transition?", "dp[w] = max value with capacity w; for each item, w from W down to wt: dp[w] = max(dp[w], dp[w−wt] + val). O(nW)."],
  ["DP", "Longest increasing subsequence in O(n log n)?", "Keep tails[]: for each x, binary search the first tail ≥ x and replace it (or append). Length of tails = LIS."],
  ["DP", "Edit distance recurrence?", "dp[i][j] = dp[i−1][j−1] if a[i]=b[j], else 1 + min(insert dp[i][j−1], delete dp[i−1][j], replace dp[i−1][j−1])."],
  ["DP", "Longest common subsequence recurrence?", "dp[i][j] = dp[i−1][j−1] + 1 if equal, else max(dp[i−1][j], dp[i][j−1]). O(nm)."],
  ["Graphs", "Minimum spanning tree algorithms?", "Kruskal (sort edges + union-find, O(E log E)) or Prim (heap from a start vertex, O(E log V))."],
  ["Graphs", "How to detect a cycle in an undirected graph?", "Union-find (an edge joining two already-connected vertices) or DFS seeing a visited vertex that isn't the parent."],
  ["Graphs", "0-1 BFS: when, and how?", "Edge weights only 0 or 1: deque, push 0-edges to the front and 1-edges to the back. O(V + E)."],
  ["Maths", "Modular inverse of a mod p (p prime)?", "a^(p−2) mod p by fast exponentiation (Fermat's little theorem)."],
  ["Maths", "Sieve of Eratosthenes complexity?", "O(n log log n); start crossing out from i², stop at √n."],
  ["Maths", "gcd algorithm and complexity?", "Euclid: gcd(a, b) = gcd(b, a mod b); O(log min(a, b)). lcm = a / gcd × b."],
  ["Maths", "Number of subsets / permutations / combinations?", "2ⁿ subsets; n! permutations; C(n, k) = n! / (k!(n−k)!)."],
];

export const BUILTIN: BuiltinCard[] = [
  ...poker(),
  ...CODING.map(([topic, front, back], i) => ({ id: `code:${i}:${front.slice(0, 24)}`, deck: "Coding", topic, front, back })),
];
