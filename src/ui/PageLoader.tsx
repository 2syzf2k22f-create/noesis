"use client";

import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { DEFAULT_SPECS } from "./defaultSpecs";
import { parseSpec, type PageSpec } from "./spec";
import { SpecView } from "./SpecView";
import s from "@/shell/shell.module.css";
import { PageHead } from "@/shell/PageHead";
import { SubNav } from "@/shell/SubNav";
import { LayoutToolbar } from "./LayoutEditor";
import type { Block } from "./spec";

/**
 * A space or generated page. Spaces use Apollo's stored layout when there is one,
 * otherwise their built-in layout. Refetches when Apollo changes something.
 */
export function PageLoader({ slug, fallbackTitle, blurb, space, crumb, children }: { slug: string; fallbackTitle: string; blurb?: string; space?: string; crumb?: string; children?: React.ReactNode }) {
  const { changes } = useApollo();
  const [draft, setDraft] = useState<PageSpec | null>(null);
  const [saving, setSaving] = useState(false);
  const [tick, setTick] = useState(0);
  const [stored, setStored] = useState<{ spec: PageSpec; version: number } | null | "missing">(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/pages/${slug}`)
      .then(async (r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        const p = j?.spec ? parseSpec(j.spec) : null;
        setStored(p?.ok ? { spec: p.spec, version: j.version } : "missing");
      })
      .catch(() => live && setStored("missing"));
    return () => { live = false; };
  }, [slug, changes, tick]);

  const base = stored && stored !== "missing" ? stored.spec : DEFAULT_SPECS[slug];
  const spec = draft ?? base;
  const custom = !!(stored && stored !== "missing");
  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const r = await fetch(`/api/pages/${slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ spec: draft }) }).catch(() => null);
    setSaving(false);
    if (r?.ok) { setDraft(null); setTick((t) => t + 1); }
    else alert(r?.status === 503 ? "Saving layouts needs the database, which isn't connected yet." : "Couldn't save the layout.");
  };
  return (
    <article className={s.space} data-ui="page">
      <PageHead slug={space ?? slug} title={spec?.title ?? fallbackTitle} sub={spec?.subtitle ?? blurb}
        kicker={`${crumb ?? "Space"}${stored && stored !== "missing" ? ` · custom layout v${stored.version}` : ""}`} />
      {space && <SubNav space={space} />}
      {children}
      {spec && !draft && (
        <button className={s.editLayout} data-ui="edit-layout" onClick={() => setDraft(JSON.parse(JSON.stringify(spec)))} title="Rearrange, resize, add or remove boxes">
          Edit layout
        </button>
      )}
      {draft && (
        <LayoutToolbar saving={saving} custom={custom}
          onAdd={(b: Block) => setDraft({ ...draft, blocks: [...draft.blocks, b] })}
          onSave={save} onCancel={() => setDraft(null)}
          onReset={async () => { await fetch(`/api/pages/${slug}`, { method: "DELETE" }).catch(() => null); setDraft(null); setTick((t) => t + 1); }} />
      )}
      {stored === null ? null : spec ? <div className={s.spaceBody}><SpecView spec={spec} edit={draft ? { onChange: (blocks) => setDraft({ ...draft, blocks }) } : undefined} /></div> : (
        <div className={s.spaceEmpty}><span className="label">Status</span><span>This page doesn&apos;t exist (yet). Ask Apollo to make it.</span></div>
      )}
    </article>
  );
}
