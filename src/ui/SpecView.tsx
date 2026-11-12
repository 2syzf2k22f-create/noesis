"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueryResult } from "@/core/query";
import { useApollo } from "@/shell/apollo";
import { BlockView, type BlockCtx } from "./Blocks";
import type { Block, PageSpec } from "./spec";
import u from "./ui.module.css";

/** Fetches every block's binding in one request; refetches after any write. */
export function useBlockData(blocks: Block[]) {
  const { changes } = useApollo();
  const [data, setData] = useState<(QueryResult | undefined)[]>([]);
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(blocks.map((b) => b.bind ?? null));

  useEffect(() => {
    const binds = JSON.parse(key) as (Block["bind"] | null)[];
    const idx = binds.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    let live = true;
    fetch("/api/data", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ binds: idx.map((i) => binds[i]) }) })
      .then(async (r) => (r.ok ? r.json() : idx.map(() => ({ error: r.status === 503 ? "no data (database not connected)" : "couldn't load" }))))
      .then((res: QueryResult[]) => {
        if (!live) return;
        const out: (QueryResult | undefined)[] = [];
        idx.forEach((i, k) => { out[i] = res[k]; });
        setData(out);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [key, changes, tick]);

  const write = useCallback<BlockCtx["write"]>(async (op, table, rowData, id) => {
    await fetch("/api/records", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, table, data: rowData, id }) });
    setTick((t) => t + 1);
  }, []);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, write, refresh };
}

export function BlockFrame({ block, ctx, bare }: { block: Block; ctx: BlockCtx; bare?: boolean }) {
  if (bare || block.type === "heading") return <BlockView block={block} ctx={ctx} />;
  return (
    <section className={`panel ${u.block}`} data-type={block.type} data-ui="block">
      <i data-ui="ticks" aria-hidden />
      {block.title && <header className="label" data-ui="block-head">{block.title}</header>}
      <BlockView block={block} ctx={ctx} />
    </section>
  );
}

type EditOps = { onChange: (blocks: Block[]) => void };

/** Grid of blocks. In edit mode: drag to reorder, resize width/height, remove. */
export function SpecView({ spec, edit }: { spec: PageSpec; edit?: EditOps }) {
  const { data, write, refresh } = useBlockData(spec.blocks);
  const [drag, setDrag] = useState<number | null>(null);
  const blocks = spec.blocks;
  const set = (i: number, patch: Partial<Block>) => edit?.onChange(blocks.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const move = (from: number, to: number) => {
    if (!edit || from === to || to < 0 || to >= blocks.length) return;
    const next = [...blocks];
    const [b] = next.splice(from, 1);
    next.splice(to, 0, b);
    edit.onChange(next);
  };
  const spanOf = (b: Block) => b.span ?? (b.type === "heading" || b.type === "text" ? 12 : 4);
  return (
    <div className={u.grid} data-editing={!!edit}>
      {blocks.map((b, i) => (
        <div key={(b.id ?? "") + i} className={u.cell} data-narrow={spanOf(b) <= 3}
          style={{ ["--span" as string]: spanOf(b), ["--rows" as string]: b.rows ?? 1 }}
          draggable={!!edit} onDragStart={() => setDrag(i)} onDragOver={(e) => { if (edit) e.preventDefault(); }}
          onDrop={() => { if (drag != null) move(drag, i); setDrag(null); }} data-dragging={drag === i}>
          {edit && (
            <div className={u.editBar}>
              <span className="label">{b.title ?? b.type}</span>
              <span>
                <button title="Move earlier" onClick={() => move(i, i - 1)}>←</button>
                <button title="Move later" onClick={() => move(i, i + 1)}>→</button>
                <button title="Narrower" onClick={() => set(i, { span: Math.max(2, spanOf(b) - 1) })}>−</button>
                <b>{spanOf(b)}/12</b>
                <button title="Wider" onClick={() => set(i, { span: Math.min(12, spanOf(b) + 1) })}>+</button>
                <button title="Shorter" onClick={() => set(i, { rows: Math.max(1, (b.rows ?? 1) - 1) })}>↥</button>
                <button title="Taller" onClick={() => set(i, { rows: Math.min(6, (b.rows ?? 1) + 1) })}>↧</button>
                <button title="Remove" onClick={() => edit.onChange(blocks.filter((_, k) => k !== i))}>×</button>
              </span>
            </div>
          )}
          <BlockFrame block={b} ctx={{ data: data[i], write, refresh }} />
        </div>
      ))}
    </div>
  );
}
