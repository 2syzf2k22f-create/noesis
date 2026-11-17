import { Suspense } from "react";
import { DocView } from "@/ui/DocView";

export function generateStaticParams() {
  return [{ id: "new" }];
}

/** A document Apollo made (report, project, CV, poster, slides...): print-ready, exports to PDF and Word. */
export default async function DocRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<div className="label">Loading…</div>}><DocView id={id} /></Suspense>;
}
