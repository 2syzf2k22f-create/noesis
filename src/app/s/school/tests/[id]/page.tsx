import { Suspense } from "react";
import { SubNav } from "@/shell/SubNav";
import { TestPage } from "@/ui/TestPage";
import { TestTitle } from "@/ui/TestTitle";

// One placeholder is pre-built so the route has a static shell; real test ids render on request.
export function generateStaticParams() {
  return [{ id: "new" }];
}

/** School > Tests > one upcoming test. */
export default async function TestRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <article data-ui="page" style={{ display: "grid", gap: 16, padding: "24px clamp(12px, 4vw, 48px)" }}>
      <div data-ui="page-head"><small className="label" data-ui="kicker">School · Tests</small><h1 style={{ margin: "4px 0" }}><TestTitle id={id} /></h1></div>
      <Suspense fallback={null}><SubNav space="school" /></Suspense>
      <Suspense fallback={<div className="label">Loading…</div>}><TestPage id={id} /></Suspense>
    </article>
  );
}
