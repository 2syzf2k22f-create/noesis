import { notFound } from "next/navigation";
import { getSpace, SPACES } from "@/shell/spaces";
import s from "@/shell/shell.module.css";

export function generateStaticParams() {
  return SPACES.map((sp) => ({ space: sp.id }));
}

export default async function SpacePage({ params }: { params: Promise<{ space: string }> }) {
  const { space } = await params;
  const sp = getSpace(space);
  if (!sp) notFound();
  return (
    <article className={s.space}>
      <div className="label">Space</div>
      <h1 className="display">{sp.name}</h1>
      <p className={s.spaceBlurb}>{sp.blurb}</p>
      <div className={s.spaceEmpty}>
        <span className="label">Status</span>
        <span>no data · this space is built in a later phase</span>
      </div>
    </article>
  );
}
