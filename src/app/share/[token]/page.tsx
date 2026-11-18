import { SharedView } from "@/ui/SharedView";

export function generateStaticParams() { return [{ token: "preview-token-placeholder" }]; }
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedView token={token} />;
}
