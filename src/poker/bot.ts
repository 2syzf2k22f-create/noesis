// Human-like bot decisions: equity by simulation vs. the number of live opponents, pot odds,
// personality (looseness, aggression, bluffing), position, noise and natural bet sizes.
import { equity } from "./cards";
import { pot, toCall, type Action, type State } from "./game";

const nice = (x: number, bb: number) => Math.max(bb, Math.round(x / (bb / 2)) * (bb / 2));

export function botAction(s: State): { action: Action; thinkMs: number; equity: number } {
  const i = s.toAct, me = s.seats[i], p = me.persona!;
  const opps = s.seats.filter((x, k) => k !== i && !x.folded && !x.out).length;
  const eq = equity(me.hole, s.board, Math.max(1, opps), s.street === "preflop" ? 200 : 300);
  const need = toCall(s, i), P = pot(s);
  const potOdds = need / (P + need || 1);
  const noise = (Math.random() - 0.5) * 0.12;
  // looser players overrate their hands; fair share = 1/(opps+1)
  const fair = 1 / (opps + 1);
  const strength = eq + noise + p.loose * 0.12 - 0.04;
  const think = (hard: boolean) => Math.round(700 + Math.random() * 1200 + (hard ? 900 + Math.random() * 1800 : 0));
  const raiseTo = (frac: number) => {
    const size = nice(Math.max(s.currentBet + s.minRaise, s.currentBet + (P + need) * frac), s.bb);
    return Math.min(me.bet + me.chips, size);
  };
  const strong = strength > fair + 0.25, good = strength > fair + 0.08;
  if (need === 0) {
    if (strong && Math.random() < 0.55 + p.aggr * 0.45) return { action: { type: "raise", to: raiseTo(0.5 + Math.random() * 0.5) }, thinkMs: think(false), equity: eq };
    if (good && Math.random() < p.aggr * 0.7) return { action: { type: "raise", to: raiseTo(0.33 + Math.random() * 0.4) }, thinkMs: think(true), equity: eq };
    if (Math.random() < p.bluff * (s.street === "river" ? 0.7 : 1)) return { action: { type: "raise", to: raiseTo(0.4 + Math.random() * 0.4) }, thinkMs: think(true), equity: eq };
    return { action: { type: "check" }, thinkMs: think(false), equity: eq };
  }
  const margin = 0.06 - p.loose * 0.12;
  if (strength > potOdds + margin) {
    if (strong && Math.random() < p.aggr * 0.8) return { action: { type: "raise", to: raiseTo(0.6 + Math.random() * 0.6) }, thinkMs: think(true), equity: eq };
    return { action: { type: "call" }, thinkMs: think(strength < potOdds + 0.1), equity: eq };
  }
  if (Math.random() < p.bluff * 0.35 && need < P * 0.5) return { action: { type: "raise", to: raiseTo(0.8) }, thinkMs: think(true), equity: eq };
  if (Math.random() < p.loose * 0.15 && need <= s.bb * 2) return { action: { type: "call" }, thinkMs: think(false), equity: eq }; // loose calls
  return { action: { type: "fold" }, thinkMs: think(strength > potOdds - 0.05), equity: eq };
}
