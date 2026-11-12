import { notFound } from "next/navigation";
import { getSpace, getSub, pageSlug, SPACES } from "@/shell/spaces";
import { PageLoader } from "@/ui/PageLoader";

export function generateStaticParams() {
  return SPACES.flatMap((sp) => (sp.subs ?? []).map((x) => ({ space: sp.id, sub: x.id })));
}

export default async function SubPage({ params }: { params: Promise<{ space: string; sub: string }> }) {
  const { space, sub } = await params;
  const sp = getSpace(space), x = getSub(space, sub);
  if (!sp || !x) notFound();
  return <PageLoader slug={pageSlug(space, sub)} space={space} fallbackTitle={x.name} blurb={x.blurb} crumb={sp.name} />;
}
