"use client";
// Practice poker table (play chips only): you vs 1-5 human-like bots.

import { useEffect, useMemo, useRef, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { usePersist } from "@/ui/usePersist";
import type { BlockCtx } from "@/ui/Blocks";
import { botAction } from "./bot";
import { act, newTable, PERSONAS, pot, startHand, toCall, type State } from "./game";
import k from "./poker.module.css";

const SUIT: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
function CardV({ c, hidden, small }: { c?: string; hidden?: boolean; small?: boolean }) {
  if (!c || hidden) return <span className={k.card} data-back="true" data-small={small} />;
  return <span className={k.card} data-red={c[1] === "h" || c[1] === "d"} data-small={small}><b>{c[0] === "T" ? "10" : c[0]}</b><i>{SUIT[c[1]]}</i></span>;
}

export function PokerTable({ ctx }: { ctx: BlockCtx }) {
  const { submit } = useApollo();
  const [cfg, setCfg] = usePersist("poker.cfg", { opponents: 3, stack: 1000, bb: 10, auto: true });
  const [s, setS] = usePersist<State | null>("poker.table", null);
  const [thinking, setThinking] = useState<number | null>(null);
  const [raise, setRaise] = useState(0);
  const handStart = useRef(0);
  const flags = useRef({ vpip: false, pfr: false });
  const savedHand = useRef(0);

  const begin = () => {
    const ps = PERSONAS.slice(0, cfg.opponents);
    const t = newTable(["You", ...ps.map((p) => p.name)], [undefined, ...ps], cfg.stack, cfg.bb / 2, cfg.bb);
    const h = startHand(t);
    handStart.current = h.seats[0].chips + h.seats[0].total;
    flags.current = { vpip: false, pfr: false };
    setS(h);
  };
  const nextHand = () => {
    if (!s) return;
    const h = startHand(s);
    if (h.seats[0].out) return setS({ ...h, log: ["You're out of chips. Start a new table."] });
    handStart.current = h.seats[0].chips + h.seats[0].total;
    flags.current = { vpip: false, pfr: false };
    setS(h);
  };

  // bots act with human-like timing
  useEffect(() => {
    if (!s || s.street === "showdown" || s.toAct === 0) return;
    let live = true;
    const seat = s.toAct;
    queueMicrotask(() => setThinking(seat));
    const { action, thinkMs } = botAction(s);
    const t = setTimeout(() => { if (live) { setThinking(null); setS(act(s, action)); } }, thinkMs);
    return () => { live = false; clearTimeout(t); };
  }, [s]);

  // record each finished hand for stats
  useEffect(() => {
    if (!s?.result || savedHand.current === s.handNo || s.seats[0].out && s.seats[0].hole.length === 0) return;
    savedHand.current = s.handNo;
    const me = s.seats[0];
    const net = me.chips - handStart.current;
    void ctx.write("create", "poker_practice", {
      hand_no: s.handNo, cards: me.hole.join(" "), board: s.board.join(" "), net, net_bb: Math.round((net / s.bb) * 10) / 10,
      won: s.result.winners.some((w) => w.seat === 0), showdown: s.result.showdown && !me.folded,
      vpip: flags.current.vpip, pfr: flags.current.pfr, opponents: s.seats.length - 1, folded: me.folded,
    });
    if (cfg.auto && !s.seats[0].out) { const t = setTimeout(nextHand, 3500); return () => clearTimeout(t); }
  }, [s]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine = !!s && s.street !== "showdown" && s.toAct === 0;
  const need = s && mine ? toCall(s, 0) : 0;
  const P = s ? pot(s) : 0;
  const minTo = s ? Math.min(s.seats[0].bet + s.seats[0].chips, s.currentBet + s.minRaise) : 0;
  const maxTo = s ? s.seats[0].bet + s.seats[0].chips : 0;
  useEffect(() => { if (mine) queueMicrotask(() => setRaise(minTo)); }, [mine, minTo]);
  const doAct = (type: "fold" | "check" | "call" | "raise", to?: number) => {
    if (!s) return;
    if (s.street === "preflop" && (type === "call" || type === "raise")) { flags.current.vpip = true; if (type === "raise") flags.current.pfr = true; }
    setS(act(s, { type, to }));
  };
  const seatsPos = useMemo(() => {
    const n = s?.seats.length ?? 2;
    return Array.from({ length: n }, (_, i) => {
      const a = Math.PI / 2 + (i / n) * Math.PI * 2; // you at the bottom
      return { left: 50 + Math.cos(a) * 42, top: 50 + Math.sin(a) * 38 };
    });
  }, [s?.seats.length]);

  if (!s)
    return (
      <div className={k.setup}>
        <p>Practice No-Limit Hold&apos;em with <b>play chips only</b> against bots that think like people: tight, loose, aggressive, passive or reckless, with bluffs, varied bet sizes and thinking time. Every hand is logged so you can study your stats.</p>
        <div className={k.row}>
          <label>Opponents <select value={cfg.opponents} onChange={(e) => setCfg({ ...cfg, opponents: Number(e.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ({PERSONAS.slice(0, n).map((p) => p.name).join(", ")})</option>)}</select></label>
          <label>Starting stack <select value={cfg.stack} onChange={(e) => setCfg({ ...cfg, stack: Number(e.target.value) })}>{[500, 1000, 2000, 5000].map((n) => <option key={n} value={n}>{n} ({n / cfg.bb} big blinds)</option>)}</select></label>
          <label>Blinds <select value={cfg.bb} onChange={(e) => setCfg({ ...cfg, bb: Number(e.target.value) })}>{[10, 20, 50].map((n) => <option key={n} value={n}>{n / 2}/{n}</option>)}</select></label>
          <label className={k.check}><input type="checkbox" checked={cfg.auto} onChange={(e) => setCfg({ ...cfg, auto: e.target.checked })} /> Deal next hand automatically</label>
        </div>
        <ul className={k.personas}>{PERSONAS.slice(0, cfg.opponents).map((p) => <li key={p.id}><b>{p.name}</b> · {p.style}</li>)}</ul>
        <button className="pill" data-active="true" onClick={begin}>Sit down</button>
      </div>
    );

  const showAll = s.street === "showdown" && s.result?.showdown;
  return (
    <div className={k.wrap}>
      <div className={k.table}>
        <div className={k.felt}>
          <div className={k.board}>{[0, 1, 2, 3, 4].map((i) => <CardV key={i} c={s.board[i]} hidden={!s.board[i]} />)}</div>
          <div className={k.pot}>Pot {P}</div>
          {s.result && <div className={k.result}>{s.result.winners.map((w) => `${s.seats[w.seat].name} ${w.seat === 0 ? "win" : "wins"} ${w.amount}${w.hand ? ` (${w.hand})` : ""}`).join(" · ")}</div>}
        </div>
        {s.seats.map((x, i) => (
          <div key={i} className={k.seat} style={{ left: `${seatsPos[i].left}%`, top: `${seatsPos[i].top}%` }}
            data-active={s.street !== "showdown" && s.toAct === i} data-folded={x.folded} data-out={x.out} data-me={i === 0}>
            <div className={k.hole}>{x.hole.map((c, j) => <CardV key={j} c={c} small={i !== 0} hidden={i !== 0 && !(showAll && !x.folded)} />)}</div>
            <b>{x.name}{i === s.dealer && <span className={k.dealer}>D</span>}</b>
            <small>{x.out ? "out" : x.allIn ? "all-in" : `${x.chips}`}{x.persona ? ` · ${x.persona.style}` : ""}</small>
            {thinking === i && <em className={k.think}>thinking…</em>}
            {x.bet > 0 && <span className={k.bet}>{x.bet}</span>}
          </div>
        ))}
      </div>
      <div className={k.side}>
        {mine ? (
          <div className={k.controls}>
            <div className={k.row}>
              <button className="pill" onClick={() => doAct("fold")}>Fold</button>
              {need === 0 ? <button className="pill" data-active="true" onClick={() => doAct("check")}>Check</button> : <button className="pill" data-active="true" onClick={() => doAct("call")}>Call {need}</button>}
              {maxTo > s.currentBet && <button className="pill" onClick={() => doAct("raise", raise)}>{s.currentBet === 0 ? "Bet" : "Raise to"} {raise}</button>}
            </div>
            {maxTo > s.currentBet && (
              <>
                <input type="range" min={minTo} max={maxTo} step={s.bb / 2} value={raise} onChange={(e) => setRaise(Number(e.target.value))} />
                <div className={k.row}>
                  {[["Min", minTo], ["½ pot", s.currentBet + Math.round((P + need) / 2)], ["¾ pot", s.currentBet + Math.round(((P + need) * 3) / 4)], ["Pot", s.currentBet + P + need], ["All-in", maxTo]].map(([l, v]) => (
                    <button key={String(l)} className={k.preset} onClick={() => setRaise(Math.max(minTo, Math.min(maxTo, Number(v))))}>{l}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : s.street === "showdown" ? (
          <div className={k.row}>
            {!cfg.auto && <button className="pill" data-active="true" onClick={nextHand}>Next hand</button>}
            <button className="pill" onClick={() => submit(`Review this practice poker hand like a coach (play chips, ${s.seats.length} players, blinds ${s.sb}/${s.bb}). My cards: ${s.seats[0].hole.join(" ")}. Board: ${s.board.join(" ") || "none"}. Action:\n${s.log.join("\n")}\nWhat did I do well or badly, and what's the better line?`, { thread: "poker:review" })}>Review hand with Apollo</button>
            <button className="pill" onClick={() => setS(null)}>Leave table</button>
          </div>
        ) : <div className="label">Waiting for {s.seats[s.toAct]?.name}…</div>}
        <ol className={k.log}>{s.log.slice(-14).map((l, i) => <li key={i}>{l}</li>)}</ol>
      </div>
    </div>
  );
}
