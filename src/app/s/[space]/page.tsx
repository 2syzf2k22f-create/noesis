import { notFound } from "next/navigation";
import { getSpace, SPACES } from "@/shell/spaces";
import { Chats } from "@/shell/Chats";
import { PageLoader } from "@/ui/PageLoader";
import { PageHead } from "@/shell/PageHead";
import s from "@/shell/shell.module.css";

export function generateStaticParams() {
  return SPACES.map((sp) => ({ space: sp.id }));
}

export default async function SpacePage({ params }: { params: Promise<{ space: string }> }) {
  const { space } = await params;
  const sp = getSpace(space);
  if (!sp) notFound();
  if (sp.id === "chats")
    return (
      <article className={s.space} data-ui="page">
        <PageHead slug={sp.id} title={sp.name} sub={sp.blurb} kicker="Space" />
        <Chats />
      </article>
    );
  return <PageLoader slug={sp.id} space={sp.subs ? sp.id : undefined} fallbackTitle={sp.name} blurb={sp.blurb} crumb={sp.subs ? `${sp.name} · overview` : "Space"} />;
}
