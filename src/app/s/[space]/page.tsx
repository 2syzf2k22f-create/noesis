import { notFound } from "next/navigation";
import { getSpace, SPACES } from "@/shell/spaces";
import { Chats } from "@/shell/Chats";
import { PageLoader } from "@/ui/PageLoader";
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
      <article className={s.space}>
        <div className="label">Space</div>
        <h1 className="display">{sp.name}</h1>
        <p className={s.spaceBlurb}>{sp.blurb}</p>
        <Chats />
      </article>
    );
  return <PageLoader slug={sp.id} fallbackTitle={sp.name} blurb={sp.blurb} />;
}
