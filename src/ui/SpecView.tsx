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
  return { data, write };
}

export function BlockFrame({ block, ctx, bare }: { block: Block; ctx: BlockCtx; bare?: boolean }) {
  if (bare || block.type === "heading") return <BlockView block={block} ctx={ctx} />;
  return (
    <section className={`panel ${u.block}`} data-type={block.type}>
      {block.title && <header className="label">{block.title}</header>}
      <BlockView block={block} ctx={ctx} />
    </section>
  );
}

export function SpecView({ spec }: { spec: PageSpec }) {
  const { data, write } = useBlockData(spec.blocks);
  return (
    <div className={u.grid}>
      {spec.blocks.map((b, i) => (
        <div key={b.id ?? i} className={u.cell} data-narrow={(b.span ?? 4) <= 3} style={{ ["--span" as string]: b.span ?? (b.type === "heading" || b.type === "text" ? 12 : 4), ["--rows" as string]: b.rows ?? 1 }}>
          <BlockFrame block={b} ctx={{ data: data[i], write }} />
        </div>
      ))}
    </div>
  );
}
