"use client";

import { useEffect, useState } from "react";
import { panelStore } from "@/shell/panelStore";
import { BlockFrame, useBlockData } from "./SpecView";
import type { Block } from "./spec";

function Loaded({ block }: { block: Block }) {
  const { data, write } = useBlockData([block]);
  return <BlockFrame block={{ ...block, title: undefined }} ctx={{ data: data[0], write }} bare />;
}

export function WidgetPanel({ id }: { id: string }) {
  const [block, setBlock] = useState<Block | null | "gone">(null);
  useEffect(() => {
    fetch(`/api/widgets/${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      setBlock(j?.block ?? "gone");
      if (j?.name) panelStore.update(`widget:${id}`, { title: j.name });
    }).catch(() => setBlock("gone"));
  }, [id]);
  if (block === null) return null;
  if (block === "gone") return <p style={{ color: "var(--text-dim)", fontSize: 13 }}>This widget was deleted.</p>;
  return <Loaded block={block} />;
}
