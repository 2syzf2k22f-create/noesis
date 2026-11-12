"use client";

import { BlockFrame, useBlockData } from "./SpecView";
import type { Block } from "./spec";

/** Renders one library block inside a floating panel (used by the inbox and stats panels). */
export function PanelBlock({ block }: { block: Block }) {
  const { data, write, refresh } = useBlockData([block]);
  return <BlockFrame block={block} ctx={{ data: data[0], write, refresh }} bare />;
}
