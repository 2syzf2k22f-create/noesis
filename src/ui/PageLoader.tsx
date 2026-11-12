"use client";

import { useEffect, useState } from "react";
import { useApollo } from "@/shell/apollo";
import { DEFAULT_SPECS } from "./defaultSpecs";
import { parseSpec, type PageSpec } from "./spec";
import { SpecView } from "./SpecView";
import s from "@/shell/shell.module.css";
import { PageHead } from "@/shell/PageHead";
import { SubNav } from "@/shell/SubNav";

/**
 * A space or generated page. Spaces use Apollo's stored layout when there is one,
 * otherwise their built-in layout. Refetches when Apollo changes something.
 */
export function PageLoader({ slug, fallbackTitle, blurb, space, crumb, children }: { slug: string; fallbackTitle: string; blurb?: string; space?: string; crumb?: string; children?: React.ReactNode }) {
  const { changes } = useApollo();
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
  }, [slug, changes]);

  const spec = stored && stored !== "missing" ? stored.spec : DEFAULT_SPECS[slug];
  return (
    <article className={s.space} data-ui="page">
      <PageHead slug={space ?? slug} title={spec?.title ?? fallbackTitle} sub={spec?.subtitle ?? blurb}
        kicker={`${crumb ?? "Space"}${stored && stored !== "missing" ? ` · Apollo layout v${stored.version}` : ""}`} />
      {space && <SubNav space={space} />}
      {children}
      {stored === null ? null : spec ? <div className={s.spaceBody}><SpecView spec={spec} /></div> : (
        <div className={s.spaceEmpty}><span className="label">Status</span><span>This page doesn&apos;t exist (yet). Ask Apollo to make it.</span></div>
      )}
    </article>
  );
}
