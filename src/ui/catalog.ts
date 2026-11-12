// Every block used anywhere in the built-in layouts, for the "Add a box" picker.
import { DEFAULT_SPECS } from "./defaultSpecs";
import type { Block } from "./spec";

export type CatalogItem = { key: string; page: string; block: Block };

export const CATALOG: CatalogItem[] = (() => {
  const seen = new Set<string>();
  const out: CatalogItem[] = [];
  for (const [slug, spec] of Object.entries(DEFAULT_SPECS)) {
    for (const b of spec.blocks) {
      const name = b.title ?? (b.props?.label as string | undefined) ?? b.type;
      const key = `${b.type}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, page: spec.title + (slug.includes("--") ? "" : " overview"), block: b });
    }
  }
  return out;
})();
