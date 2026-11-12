// No-limit Texas Hold'em engine for practice (play chips). Handles blinds, betting rounds,
// min-raises, all-ins and side pots. Pure state transitions.
import { best, category, fullDeck, shuffled, type Card } from "./cards";

export type Persona = { id: string; name: string; style: string; loose: number; aggr: number; bluff: number };
export const PERSONAS: Persona[] = [
  { id: "tag", name: "Maya", style: "tight-aggressive", loose: 0.25, aggr: 0.7, bluff: 0.12 },
  { id: "lag", name: "Leo", style: "loose-aggressive", loose: 0.55, aggr: 0.75, bluff: 0.25 },
  { id: "station", name: "Sam", style: "calling station", loose: 0.7, aggr: 0.15, bluff: 0.03 },
  { id: "rock", name: "Ivy", style: "tight-passive rock", loose: 0.15, aggr: 0.3, bluff: 0.02 },
  { id: "maniac", name: "Dex", style: "maniac", loose: 0.8, aggr: 0.9, bluff: 0.4 },
];

export type Seat = { name: string; persona?: Persona; chips: number; hole: Card[]; bet: number; total: number; folded: boolean; allIn: boolean; acted: boolean; out: boolean };
export type Street = "preflop" | "flop" | "turn" | "river" | "showdown";
export type State = {
  seats: Seat[]; deck: Card[]; board: Card[]; dealer: number; toAct: number; street: Street;
  currentBet: number; minRaise: number; sb: number; bb: number; log: string[]; handNo: number;
  result: { winners: { seat: number; amount: number; hand: string }[]; showdown: boolean } | null;
};
export type Action = { type: "fold" | "check" | "call" | "raise"; to?: number };

/** "You check" / "Maya checks" */
const v = (x: Seat, verb: string) => (x.name === "You" ? verb : verb.endsWith("h") ? `${verb}es` : `${verb}s`);
const live = (s: State) => s.seats.map((x, i) => ({ x, i })).filter(({ x }) => !x.folded && !x.out);
const nextIdx = (s: State, from: number, pred: (x: Seat) => boolean) => {
  for (let k = 1; k <= s.seats.length; k++) { const i = (from + k) % s.seats.length; if (pred(s.seats[i])) return i; }
  return -1;
};
export const pot = (s: State) => s.seats.reduce((a, x) => a + x.total, 0);
export const toCall = (s: State, i: number) => Math.min(s.seats[i].chips, s.currentBet - s.seats[i].bet);

export function newTable(names: string[], personas: (Persona | undefined)[], chips = 1000, sb = 5, bb = 10): State {
  return {
    seats: names.map((name, i) => ({ name, persona: personas[i], chips, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, out: false })),
    deck: [], board: [], dealer: 0, toAct: 0, street: "preflop", currentBet: 0, minRaise: bb, sb, bb, log: [], handNo: 0, result: null,
  };
}

function post(s: State, i: number, amt: number) {
  const x = s.seats[i], a = Math.min(amt, x.chips);
  x.chips -= a; x.bet += a; x.total += a;
  if (x.chips === 0) x.allIn = true;
}

export function startHand(prev: State): State {
  const s: State = structuredClone(prev);
  for (const x of s.seats) { x.out = x.chips <= 0; x.hole = []; x.bet = 0; x.total = 0; x.folded = x.out; x.allIn = false; x.acted = false; }
  if (s.seats.filter((x) => !x.out).length < 2) return s;
  s.handNo += 1; s.board = []; s.result = null; s.street = "preflop"; s.log = [];
  s.deck = shuffled(fullDeck());
  if (s.handNo > 1) s.dealer = nextIdx(s, s.dealer, (x) => !x.out);
  else if (s.seats[s.dealer].out) s.dealer = nextIdx(s, s.dealer, (x) => !x.out);
  for (const x of s.seats) if (!x.out) x.hole = [s.deck.pop()!, s.deck.pop()!];
  const headsUp = s.seats.filter((x) => !x.out).length === 2;
  const sbI = headsUp ? s.dealer : nextIdx(s, s.dealer, (x) => !x.out);
  const bbI = nextIdx(s, sbI, (x) => !x.out);
  post(s, sbI, s.sb); post(s, bbI, s.bb);
  s.log.push(`Hand #${s.handNo}: ${s.seats[sbI].name} posts ${s.sb}, ${s.seats[bbI].name} posts ${s.bb}`);
  s.currentBet = s.bb; s.minRaise = s.bb;
  s.toAct = nextIdx(s, bbI, (x) => !x.folded && !x.allIn && !x.out);
  return s;
}

function roundDone(s: State) {
  const act = s.seats.filter((x) => !x.folded && !x.out && !x.allIn);
  return act.every((x) => x.acted && x.bet === s.currentBet) || act.length === 0 || (act.length === 1 && act[0].bet >= s.currentBet && live(s).length > 1 && act[0].acted);
}

function settle(s: State, showdown: boolean) {
  const contenders = live(s);
  const winners: { seat: number; amount: number; hand: string }[] = [];
  if (contenders.length === 1) {
    const amt = pot(s);
    s.seats[contenders[0].i].chips += amt;
    winners.push({ seat: contenders[0].i, amount: amt, hand: "" });
  } else {
    const scores = new Map(contenders.map(({ i }) => [i, best([...s.seats[i].hole, ...s.board])]));
    // side pots: layer by contribution levels
    const levels = [...new Set(s.seats.filter((x) => x.total > 0).map((x) => x.total))].sort((a, b) => a - b);
    let prevLvl = 0;
    for (const lvl of levels) {
      const layer = s.seats.reduce((a, x) => a + Math.max(0, Math.min(x.total, lvl) - prevLvl), 0);
      const elig = contenders.filter(({ i }) => s.seats[i].total >= lvl).map(({ i }) => i);
      prevLvl = lvl;
      if (!layer || !elig.length) continue;
      const top = Math.max(...elig.map((i) => scores.get(i)!));
      const ws = elig.filter((i) => scores.get(i) === top);
      const share = Math.floor(layer / ws.length);
      let rem = layer - share * ws.length;
      for (const w of ws) {
        const amt = share + (rem-- > 0 ? 1 : 0);
        s.seats[w].chips += amt;
        const ex = winners.find((x) => x.seat === w);
        if (ex) ex.amount += amt; else winners.push({ seat: w, amount: amt, hand: category(scores.get(w)!) });
      }
    }
  }
  s.street = "showdown";
  s.result = { winners, showdown };
  for (const w of winners) s.log.push(`${s.seats[w.seat].name} ${v(s.seats[w.seat], "win")} ${w.amount}${w.hand ? ` with ${w.hand.toLowerCase()}` : ""}`);
}

function nextStreet(s: State) {
  for (const x of s.seats) { x.bet = 0; x.acted = false; }
  s.currentBet = 0; s.minRaise = s.bb;
  if (s.street === "preflop") { s.board.push(s.deck.pop()!, s.deck.pop()!, s.deck.pop()!); s.street = "flop"; }
  else if (s.street === "flop") { s.board.push(s.deck.pop()!); s.street = "turn"; }
  else if (s.street === "turn") { s.board.push(s.deck.pop()!); s.street = "river"; }
  else return settle(s, true);
  s.log.push(`${s.street[0].toUpperCase() + s.street.slice(1)}: ${s.board.join(" ")}`);
  const canAct = s.seats.filter((x) => !x.folded && !x.out && !x.allIn);
  if (canAct.length <= 1) return nextStreet(s); // everyone all-in: run it out
  s.toAct = nextIdx(s, s.dealer, (x) => !x.folded && !x.allIn && !x.out);
}

export function act(prev: State, a: Action): State {
  const s: State = structuredClone(prev);
  const i = s.toAct, x = s.seats[i];
  const need = toCall(s, i);
  if (a.type === "fold") { x.folded = true; s.log.push(`${x.name} ${v(x, "fold")}`); }
  else if (a.type === "check" || (a.type === "call" && need === 0)) { s.log.push(`${x.name} ${v(x, "check")}`); }
  else if (a.type === "call") { post(s, i, need); s.log.push(`${x.name} ${v(x, "call")} ${need}${x.allIn ? " (all-in)" : ""}`); }
  else {
    const maxTo = x.bet + x.chips;
    let to = Math.min(maxTo, Math.max(a.to ?? 0, s.currentBet + s.minRaise));
    if (to <= s.currentBet) { post(s, i, need); s.log.push(`${x.name} ${v(x, "call")} ${need}`); }
    else {
      const raiseBy = to - s.currentBet;
      if (raiseBy >= s.minRaise) { s.minRaise = raiseBy; for (const y of s.seats) if (y !== x) y.acted = false; }
      post(s, i, to - x.bet);
      s.currentBet = Math.max(s.currentBet, x.bet);
      to = x.bet;
      s.log.push(`${x.name} ${prev.currentBet === 0 ? v(x, "bet") : `${v(x, "raise")} to`} ${to}${x.allIn ? " (all-in)" : ""}`);
    }
  }
  x.acted = true;
  if (live(s).length === 1) { settle(s, false); return s; }
  if (roundDone(s)) { nextStreet(s); return s; }
  s.toAct = nextIdx(s, i, (y) => !y.folded && !y.allIn && !y.out);
  return s;
}
