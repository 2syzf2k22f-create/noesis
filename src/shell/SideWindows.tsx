"use client";
// Pages open side by side next to the current one.

import Link from "next/link";
import { getSpace, getSub } from "./spaces";
import { uiStore, useUi } from "./uiStore";
import { PageLoader } from "@/ui/PageLoader";
import s from "./dock.module.css";

function href(to: string) {
  const [sp, sub] = to.split("--");
  return getSpace(sp) ? (sub ? `/s/${sp}/${sub}` : `/s/${sp}`) : `/p/${to}`;
}

function Window({ to }: { to: string }) {
  const [sp, sub] = to.split("--");
  const space = getSpace(sp), x = sub ? getSub(sp, sub) : null;
  const title = x ? `${space?.name} › ${x.name}` : space?.name ?? to;
  return (
    <section className={s.window} data-window-title={title}>
      <header className={s.winHead}>
        <b>{title}</b>
        <span>
          <Link href={href(to)} onClick={() => uiStore.closeWindow(to)}>Make main</Link>
          <button onClick={() => uiStore.closeWindow(to)} aria-label="Close">✕</button>
        </span>
      </header>
      {space ? (
        x ? <PageLoader slug={to} space={sp} fallbackTitle={x.name} blurb={x.blurb} crumb={space.name} />
          : <PageLoader slug={sp} space={space.subs ? sp : undefined} fallbackTitle={space.name} blurb={space.blurb} crumb="Space" />
      ) : <PageLoader slug={to} fallbackTitle={to} crumb="Page" />}
    </section>
  );
}

export function SideWindows({ children }: { children: React.ReactNode }) {
  const { windows } = useUi();
  if (!windows.length) return <>{children}</>;
  return (
    <div className={s.split}>
      <div className={s.main}>{children}</div>
      {windows.map((w) => <Window key={w} to={w} />)}
    </div>
  );
}
