"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApollo, type Action } from "./apollo";
import { Icon } from "./Icon";
import s from "./shell.module.css";

type Found = { table: string; id: string; title: string; sub: string; href: string; link?: string };
type Row = ({ kind: "action"; a: Action } | { kind: "ask"; q: string } | { kind: "found"; f: Found }) & { head?: string };

function Palette() {
  const { actions, runAction, submit, setPaletteOpen } = useApollo();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [found, setFound] = useState<Found[]>([]);
  // search your data too (debounced)
  useEffect(() => {
    if (q.trim().length < 2) { queueMicrotask(() => setFound([])); return; }
    const t = setTimeout(() => { fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then((r) => (r.ok ? r.json() : [])).then(setFound).catch(() => {}); }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const rows = useMemo<Row[]>(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = actions.filter((a) => {
      const hay = `${a.label} ${a.group} ${a.keywords.join(" ")}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    const out: Row[] = hits.slice(0, 30).map((a) => ({ kind: "action", a }));
    for (const f of found.slice(0, 12)) out.push({ kind: "found", f });
    if (q.trim()) out.push({ kind: "ask", q: q.trim() });
    return out.map((r, i) => {
      const group = (x: Row) => (x.kind === "action" ? x.a.group : x.kind === "found" ? "In your data" : "Apollo");
      return i === 0 || group(out[i - 1]) !== group(r) ? { ...r, head: group(r) } : r;
    });
  }, [actions, q, found]);

  const active = Math.min(idx, Math.max(0, rows.length - 1));
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  const run = (r: Row | undefined) => {
    if (!r) return;
    if (r.kind === "action") runAction(r.a);
    else if (r.kind === "found") { setPaletteOpen(false); if (r.f.link && /^https?:/.test(r.f.link)) window.open(r.f.link, "_blank"); else router.push(r.f.href); }
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
          placeholder="Search your data, go somewhere, or ask Apollo"
          aria-label="Command"
          autoComplete="off"
        />
        <div className={s.paletteList} ref={listRef} role="listbox">
          {rows.map((r, i) => {
            return (
              <div key={r.kind === "action" ? r.a.id : r.kind === "found" ? `f:${r.f.table}:${r.f.id}` : "ask"}>
                {r.head && <div className={`label ${s.paletteGroup}`}>{r.head}</div>}
                <button
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  className={s.row}
                  onPointerMove={() => setIdx(i)}
                  onClick={() => run(r)}
                >
                  <Icon name={r.kind === "action" ? r.a.icon : r.kind === "found" ? "file" : "ask"} />
                  <span>
                    {r.kind === "action" ? r.a.label : r.kind === "found" ? r.f.title : `Ask Apollo: ${r.q}`}
                    {r.kind === "action" && r.a.hint && <small>{r.a.hint}</small>}
                    {r.kind === "found" && <small>{r.f.table.replace(/_/g, " ")}{r.f.sub ? ` · ${r.f.sub}` : ""}</small>}
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
