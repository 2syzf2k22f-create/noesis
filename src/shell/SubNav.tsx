"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getSpace, pageHref } from "./spaces";
import s from "./shell.module.css";

/** Tabs inside a space: its dashboard, then each subpage. Styled per skin via [data-ui]. */
export function SubNav({ space }: { space: string }) {
  const sp = getSpace(space);
  const pathname = usePathname();
  if (!sp?.subs?.length) return null;
  const items = [{ href: pageHref(space), name: "Overview" }, ...sp.subs.map((x) => ({ href: pageHref(space, x.id), name: x.name }))];
  return (
    <nav className={s.subnav} data-ui="subnav" aria-label={`${sp.name} pages`}>
      {items.map((it, i) => (
        <Link key={it.href} href={it.href} data-ui="subnav-item" aria-current={pathname === it.href ? "page" : undefined}>
          <b data-ui="idx">{String(i).padStart(2, "0")}</b>
          <span>{it.name}</span>
        </Link>
      ))}
    </nav>
  );
}
