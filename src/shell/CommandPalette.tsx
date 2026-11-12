"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApollo, type Action } from "./apollo";
import { Icon } from "./Icon";
import s from "./shell.module.css";

type Row = ({ kind: "action"; a: Action } | { kind: "ask"; q: string }) & { head?: string };

function Palette() {
  const { actions, runAction, submit, setPaletteOpen } = useApollo();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo<Row[]>(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = actions.filter((a) => {
      const hay = `${a.label} ${a.group} ${a.keywords.join(" ")}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    const out: Row[] = hits.map((a) => ({ kind: "action", a }));
    if (q.trim()) out.push({ kind: "ask", q: q.trim() });
    return out.map((r, i) => {
      const group = (x: Row) => (x.kind === "action" ? x.a.group : "Apollo");
      return i === 0 || group(out[i - 1]) !== group(r) ? { ...r, head: group(r) } : r;
    });
  }, [actions, q]);

  const active = Math.min(idx, Math.max(0, rows.length - 1));
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  const run = (r: Row | undefined) => {
    if (!r) return;
    if (r.kind === "action") runAction(r.a);
    else submit(r.q);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx(Math.min(active + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(Math.max(active - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(rows[active]); }
    else if (e.key === "Escape") { e.preventDefault(); setPaletteOpen(false); }
  };

  return (
    <div className={s.scrim} onPointerDown={(e) => { if (e.target === e.currentTarget) setPaletteOpen(false); }}>
      <div className={`panel ${s.palette}`} role="dialog" aria-label="Command palette">
        <input
          autoFocus
          value={q}
          onChange={(e) => { setQ(e.target.value); setIdx(0); }}
          onKeyDown={onKey}
          placeholder="Go somewhere, change the style, or ask Apollo"
          aria-label="Command"
          autoComplete="off"
        />
        <div className={s.paletteList} ref={listRef} role="listbox">
          {rows.map((r, i) => {
            return (
              <div key={r.kind === "action" ? r.a.id : "ask"}>
                {r.head && <div className={`label ${s.paletteGroup}`}>{r.head}</div>}
                <button
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  className={s.row}
                  onPointerMove={() => setIdx(i)}
                  onClick={() => run(r)}
                >
                  <Icon name={r.kind === "action" ? r.a.icon : "ask"} />
                  <span>
                    {r.kind === "action" ? r.a.label : `Ask Apollo: ${r.q}`}
                    {r.kind === "action" && r.a.hint && <small>{r.a.hint}</small>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function CommandPalette() {
  const { paletteOpen } = useApollo();
  return paletteOpen ? <Palette /> : null;
}
