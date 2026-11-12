import { PageLoader } from "@/ui/PageLoader";

// Pages Apollo generates. Rendered from their stored JSON spec.
// One placeholder is pre-built so the route has a static shell; real slugs render on request.
export function generateStaticParams() {
  return [{ slug: "new" }];
}

export default async function GeneratedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PageLoader slug={slug} fallbackTitle={slug.replace(/-/g, " ")} />;
}
