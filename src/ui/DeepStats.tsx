"use client";

import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { Bars } from "./Blocks";
import u from "./ui.module.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DS = Record<string, any>;

const n = (v: number | null | undefined, unit?: string) => (v == null ? "—" : `${Math.abs(v) >= 10000 ? `${(v / 1000).toFixed(1)}k` : v}${unit ? ` ${unit}` : ""}`);
function Delta({ now, prev, better = "higher" }: { now: number | null; prev: number | null; better?: string }) {
  if (now == null || prev == null || prev === 0) return <small className={u.delta}>no earlier data</small>;
  const d = Math.round(((now - prev) / Math.abs(prev)) * 100);
  const good = better === "higher" ? d >= 0 : d <= 0;
  return <small className={u.delta} data-good={good}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)}% vs previous period</small>;
}

/** In-depth stats for one metric: summary, trend, consistency, patterns, distribution, breakdown. */
export function DeepStats({ p }: { p: P }) {
  const { changes } = useApollo();
  const [days, setDays] = useState<number>(p.days ?? 90);
  const [s, setS] = useState<DS | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/deepstats", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...p, days }) })
      .then(async (r) => (r.ok ? setS(await r.json()) : setErr(r.status === 503 ? "no data (database not connected)" : "couldn't load")))
      .catch(() => setErr("couldn't load"));
  }, [p, days, changes]);
  const unit = p.unit as string | undefined;
  return (
    <div className={u.deep}>
      <div className={u.row}>
        {[7, 30, 90, 365].map((d) => <button key={d} className="pill" aria-pressed={d === days} onClick={() => setDays(d)}>{d === 365 ? "1 year" : `${d} days`}</button>)}
      </div>
      {err ? <div className={u.nodata}>{err}</div> : !s ? null : s.empty ? <div className={u.nodata}>No data in the last {days} days.</div> : (
        <>
          <div className={u.kpis}>
            {p.field ? (
              <>
                <div><span className="label">Total</span><b>{n(s.total, unit)}</b><Delta now={s.total} prev={s.prevTotal} /></div>
                <div><span className="label">Average</span><b>{n(s.mean, unit)}</b><Delta now={s.mean} prev={s.prevMean} better={s.better} /></div>
                <div><span className="label">Median</span><b>{n(s.median, unit)}</b><small>middle 80%: {n(s.p10)}–{n(s.p90)}</small></div>
                <div><span className="label">Personal best</span><b>{n(s.best.value, unit)}</b><small>{new Date(s.best.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small></div>
                <div><span className="label">Last 5 average</span><b>{n(s.recentAvg, unit)}</b><small>better than {s.recentPercentile}% of your entries</small></div>
                <div><span className="label">Spread (SD)</span><b>{n(s.sd)}</b><small>range {n(s.min)}–{n(s.max)}</small></div>
              </>
            ) : (
              <div><span className="label">Entries</span><b>{s.count}</b><Delta now={s.count} prev={s.prevCount} /></div>
            )}
            <div><span className="label">Trend</span><b>{s.trendPerWeek == null ? "—" : `${s.trendPerWeek > 0 ? "+" : ""}${s.trendPerWeek}`}</b><small>per week (daily total)</small></div>
            <div><span className="label">Consistency</span><b>{s.consistency}%</b><small>{s.activeDays} of {days} days active</small></div>
            <div><span className="label">Streak</span><b>{s.streak.current} d</b><small>best {s.streak.best} d</small></div>
            <div><span className="label">Per active day</span><b>{n(s.perActiveDay, unit)}</b><small>best day {s.bestDay ? `${n(s.bestDay.value)} (${s.bestDay.day.slice(5)})` : "—"}</small></div>
          </div>
          <div className={u.deepCharts}>
            <div><span className="label">By weekday{p.field ? " (average)" : ""}</span><Bars series={s.weekday} h={110} /></div>
            <div><span className="label">Time of day (entries)</span><Bars series={s.hours} h={110} /></div>
            {p.field && <div><span className="label">Distribution</span><Bars series={s.histogram} h={110} /></div>}
            {s.breakdown && <div><span className="label">By {p.groupBy}</span><Bars series={s.breakdown.slice(0, 12)} h={110} /></div>}
          </div>
        </>
      )}
    </div>
  );
}
