"use client";
// Chess in depth, per time control: rating (current, peak, change, history), results by colour,
// opponent strength, streaks, time of day, game length, how games end, and everything from your
// game reviews (accuracy trend, blunders per game, phase strengths, accuracy in wins vs losses).

import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { Bars, Spark } from "@/ui/Blocks";
import type { BlockCtx } from "@/ui/Blocks";
import u from "@/ui/ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = { id: string; [k: string]: any };
const nowMs = () => Date.now();
const TC = ["all", "rapid", "blitz", "bullet", "daily", "practice"] as const;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
const plies = (pgn: string) => { try { const c = new Chess(); c.loadPgn(pgn); return c.history().length; } catch { return null; } };
const ending = (g: Row) => {
  const t = /\[Termination "([^"]+)"\]/.exec(g.pgn ?? "")?.[1]?.toLowerCase() ?? "";
  return /checkmate/.test(t) ? "checkmate" : /resign/.test(t) ? "resignation" : /time|timeout/.test(t) ? "time" : /abandon/.test(t) ? "abandoned" : /stalemate/.test(t) ? "stalemate" : /repetition/.test(t) ? "repetition" : /agree/.test(t) ? "agreement" : /insufficient/.test(t) ? "insufficient material" : t ? "other" : "unknown";
};
function Card({ label, value, sub, tone }: { label: string; value: string | number | null; sub?: string; tone?: string }) {
  return <div style={{ padding: "8px 10px", borderRadius: 8, background: "var(--surface)" }}><small className="label">{label}</small><div style={{ fontSize: 20, fontWeight: 700, color: tone }}>{value ?? "—"}</div>{sub && <small className="label">{sub}</small>}</div>;
}
const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <div style={{ display: "grid", gap: 6 }}><span className="label">{title}</span>{children}</div>;

export function ChessStats({ ctx }: { ctx: BlockCtx }) {
  const { changes } = useApollo();
  const [games, setGames] = useState<Row[]>([]);
  const [practice, setPractice] = useState<Row[]>([]);
  const [tc, setTc] = useState<(typeof TC)[number]>("rapid");
  const [range, setRange] = useState(90);
  useEffect(() => {
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: [{ table: "chess_games", limit: 500 }, { table: "chess_practice", limit: 500 }] }) })
      .then((r) => r.json()).then(([g, p]) => { setGames(g?.rows ?? []); setPractice(p?.rows ?? []); }).catch(() => {});
  }, [changes, ctx.data]);

  const G = useMemo(() => {
    const base = tc === "practice" ? games.filter((g) => !g.url) : tc === "all" ? games : games.filter((g) => g.time_class === tc && g.url);
    return base.filter((g) => Date.parse(g.created_at) > nowMs() - range * 864e5).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  }, [games, tc, range]);
  const counts = useMemo(() => Object.fromEntries(TC.map((t) => [t, t === "all" ? games.length : t === "practice" ? games.filter((g) => !g.url).length : games.filter((g) => g.time_class === t && g.url).length])), [games]);

  const s = useMemo(() => {
    const w = G.filter((g) => g.result === "win").length, d = G.filter((g) => g.result === "draw").length, l = G.filter((g) => g.result === "loss").length;
    const rated = G.filter((g) => g.rating);
    const cur = rated.at(-1)?.rating ?? null, first = rated[0]?.rating ?? null;
    const peak = rated.length ? Math.max(...rated.map((g) => g.rating)) : null, low = rated.length ? Math.min(...rated.map((g) => g.rating)) : null;
    const byColour = (c: string) => { const x = G.filter((g) => g.color === c); return { n: x.length, win: pct(x.filter((g) => g.result === "win").length, x.length), score: pct(x.reduce((a, g) => a + (g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0), 0), x.length) }; };
    const vsBucket = (lo: number, hi: number) => { const x = G.filter((g) => g.rating && g.opponent_rating && g.opponent_rating - g.rating >= lo && g.opponent_rating - g.rating < hi); return { label: lo <= -1000 ? "100+ lower" : hi >= 1000 ? "100+ higher" : "within 100", value: pct(x.reduce((a, g) => a + (g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0), 0), x.length) ?? 0, n: x.length }; };
    let best = 0, run = 0, curStreak = 0;
    for (const g of G) { if (g.result === "win") { run++; best = Math.max(best, run); } else run = 0; }
    for (const g of [...G].reverse()) { if (g.result === "win") curStreak++; else break; }
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => { const x = G.filter((g) => (new Date(g.created_at).getDay() + 6) % 7 === i); return { label, value: pct(x.filter((g) => g.result === "win").length, x.length) ?? 0, n: x.length }; });
    const tod = [["Morning", 5, 12], ["Afternoon", 12, 17], ["Evening", 17, 22], ["Night", 22, 29]].map(([label, a, b]) => { const x = G.filter((g) => { const h = new Date(g.created_at).getHours(); const hh = h < 5 ? h + 24 : h; return hh >= (a as number) && hh < (b as number); }); return { label: label as string, value: pct(x.filter((g) => g.result === "win").length, x.length) ?? 0, n: x.length }; });
    const lens = G.map((g) => ({ g, n: g.pgn ? plies(g.pgn) : null })).filter((x) => x.n);
    const lenBuckets = [["Short (<30 moves)", 0, 60], ["Medium (30-50)", 60, 100], ["Long (50+)", 100, 999]].map(([label, a, b]) => { const x = lens.filter((y) => y.n! >= (a as number) && y.n! < (b as number)); return { label: label as string, value: pct(x.filter((y) => y.g.result === "win").length, x.length) ?? 0, n: x.length }; });
    const ends = (res: string) => { const m = new Map<string, number>(); for (const g of G.filter((x) => x.result === res)) m.set(ending(g), (m.get(ending(g)) ?? 0) + 1); return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); };
    // reviews
    const R = G.filter((g) => g.review?.accuracy);
    const side = (g: Row) => (g.review.me ?? (g.color === "black" ? "b" : "w")) as "w" | "b";
    const acc = R.map((g) => ({ label: new Date(g.created_at).toISOString().slice(0, 10), value: Number(g.review.accuracy[side(g)]) }));
    const per = (k: string) => avg(R.map((g) => Number(g.review.counts?.[side(g)]?.[k] ?? 0)));
    const phase = (k: string) => avg(R.map((g) => g.review.phases?.[side(g)]?.[k]).filter((v: unknown) => v != null).map(Number));
    const accIn = (res: string) => avg(R.filter((g) => g.result === res).map((g) => Number(g.review.accuracy[side(g)])));
    const oppAcc = avg(R.map((g) => Number(g.review.accuracy[side(g) === "w" ? "b" : "w"])));
    return {
      n: G.length, w, d, l, cur, first, peak, low, change: cur != null && first != null ? cur - first : null,
      ratingSeries: rated.map((g) => ({ label: new Date(g.created_at).toISOString().slice(0, 10), value: g.rating })),
      white: byColour("white"), black: byColour("black"),
      vs: [vsBucket(-9999, -100), vsBucket(-100, 100), vsBucket(100, 9999)],
      best, curStreak, dow, tod, lenBuckets, avgLen: avg(lens.map((x) => Math.round(x.n! / 2))), winEnds: ends("win"), lossEnds: ends("loss"),
      reviewed: R.length, acc, avgAcc: avg(acc.map((a) => a.value)), oppAcc, accWin: accIn("win"), accLoss: accIn("loss"),
      blunders: per("blunder"), mistakes: per("mistake"), inacc: per("inaccuracy"), brilliant: per("brilliant"), misses: per("miss"),
      phases: [["Opening", phase("opening")], ["Middlegame", phase("middlegame")], ["Endgame", phase("endgame")]] as [string, number | null][],
    };
  }, [G]);
  const weakest = s.phases.filter(([, v]) => v != null).sort((a, b) => (a[1] as number) - (b[1] as number))[0];
  const pr = tc === "practice" ? practice.filter((p) => Date.parse(p.created_at) > nowMs() - range * 864e5) : [];

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className={u.row}>
        {TC.map((t) => <button key={t} className="pill" data-active={tc === t} onClick={() => setTc(t)}>{t} ({counts[t]})</button>)}
        <select value={range} onChange={(e) => setRange(Number(e.target.value))} style={{ height: 32, borderRadius: 8, padding: "0 8px" }}>{[30, 90, 365, 3650].map((d) => <option key={d} value={d}>{d === 3650 ? "All time" : `${d} days`}</option>)}</select>
      </div>
      {!s.n ? <div className="label">No {tc === "all" ? "" : `${tc} `}games in this period. Sync chess.com or play Stockfish.</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
            {tc !== "practice" && <Card label="Rating now" value={s.cur} sub={s.change != null ? `${s.change >= 0 ? "+" : ""}${s.change} this period` : undefined} tone={s.change == null ? undefined : s.change >= 0 ? "var(--good)" : "var(--danger)"} />}
            {tc !== "practice" && <Card label="Peak / lowest" value={s.peak != null ? `${s.peak} / ${s.low}` : null} />}
            <Card label="Games" value={s.n} sub={`${s.w}W ${s.d}D ${s.l}L`} />
            <Card label="Score" value={`${pct(s.w + s.d / 2, s.n)}%`} sub={`win rate ${pct(s.w, s.n)}%`} />
            <Card label="Win streak" value={s.curStreak} sub={`best ${s.best}`} />
            <Card label="Average length" value={s.avgLen != null ? `${s.avgLen} moves` : null} />
            <Card label="Reviewed games" value={`${s.reviewed}/${s.n}`} sub={s.reviewed < s.n ? "review more for deeper stats" : undefined} />
          </div>
          {tc !== "practice" && s.ratingSeries.length > 1 && <Section title={`${tc === "all" ? "Rating (all modes mixed: pick a mode for a clean line)" : `${tc} rating`} over time`}><Spark series={s.ratingSeries} h={140} markers axes /></Section>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            <Section title="By colour (score %)"><Bars series={[{ label: `White (${s.white.n})`, value: s.white.score ?? 0 }, { label: `Black (${s.black.n})`, value: s.black.score ?? 0 }]} h={110} unit="%" /></Section>
            <Section title="Score % by opponent's rating vs yours"><Bars series={s.vs.map((x) => ({ label: `${x.label} (${x.n})`, value: x.value }))} h={110} unit="%" /></Section>
            <Section title="Win % by day"><Bars series={s.dow.map((x) => ({ label: `${x.label}`, value: x.value }))} h={110} unit="%" /></Section>
            <Section title="Win % by time of day"><Bars series={s.tod.map((x) => ({ label: `${x.label} (${x.n})`, value: x.value }))} h={110} unit="%" /></Section>
            <Section title="Win % by game length"><Bars series={s.lenBuckets.map((x) => ({ label: `${x.label} (${x.n})`, value: x.value }))} h={110} unit="%" /></Section>
            <Section title="How you win"><Bars series={s.winEnds} h={110} /></Section>
            <Section title="How you lose"><Bars series={s.lossEnds} h={110} /></Section>
          </div>
          <Section title={`From your game reviews (${s.reviewed} game${s.reviewed === 1 ? "" : "s"})`}>
            {!s.reviewed ? <span className="label">Review games on Mind › Game review and accuracy, blunders, phase strengths and more appear here.</span> : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
                  <Card label="Average accuracy" value={s.avgAcc} sub={s.oppAcc != null ? `opponents ${s.oppAcc}` : undefined} />
                  <Card label="Accuracy in wins / losses" value={`${s.accWin ?? "—"} / ${s.accLoss ?? "—"}`} />
                  <Card label="Blunders per game" value={s.blunders} tone={(s.blunders ?? 0) > 1 ? "var(--danger)" : undefined} />
                  <Card label="Mistakes per game" value={s.mistakes} />
                  <Card label="Inaccuracies per game" value={s.inacc} />
                  <Card label="Misses per game" value={s.misses} />
                  <Card label="Brilliants per game" value={s.brilliant} />
                  {weakest && <Card label="Weakest phase" value={weakest[0]} sub={`${weakest[1]}% accuracy`} tone="#f5a524" />}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                  {s.acc.length > 1 && <Section title="Accuracy per game"><Spark series={s.acc} h={110} markers axes /></Section>}
                  <Section title="Accuracy by phase"><Bars series={s.phases.filter(([, v]) => v != null).map(([label, value]) => ({ label, value: value as number }))} h={110} /></Section>
                </div>
              </>
            )}
          </Section>
          {tc === "practice" && pr.length > 0 && (
            <Section title="Practice vs Stockfish: score by bot Elo">
              <Bars series={[...new Set(pr.map((p) => p.elo))].sort((a, b) => a - b).map((e) => { const x = pr.filter((p) => p.elo === e); return { label: String(e), value: Math.round((x.reduce((a, p) => a + Number(p.score), 0) / x.length) * 100) }; })} h={110} unit="%" />
            </Section>
          )}
        </>
      )}
    </div>
  );
}
