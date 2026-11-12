"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/theme/ThemeProvider";
import { useApollo } from "./apollo";
import { Icon } from "./Icon";
import { SPACES } from "./spaces";
import s from "./shell.module.css";

type Open = "pages" | "style" | null;

/** Two small fold-out menus in the top-right corner: pages and styles. No Apollo needed. */
export function CornerMenus() {
  const [open, setOpen] = useState<Open>(null);
  const { preset, presets, setTheme } = useTheme();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const { changes } = useApollo();
  const [made, setMade] = useState<{ slug: string; title: string }[]>([]);
  useEffect(() => {
    fetch("/api/pages").then((r) => (r.ok ? r.json() : [])).then((rows: { slug: string; title: string; space: string | null }[]) =>
      setMade(rows.filter((p) => !SPACES.some((sp) => sp.id === p.slug)))).catch(() => {});
  }, [changes, open]);

  // close on navigation, outside click, Escape
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) { setLastPath(pathname); setOpen(null); }
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", down); window.removeEventListener("keydown", key); };
  }, [open]);

  const toggle = (m: Open) => setOpen((o) => (o === m ? null : m));

  return (
    <div className={s.corner} ref={ref} data-ui="corner" data-open={open ?? undefined}>
      <button className={s.cornerBtn} aria-expanded={open === "style"} aria-label="Styles" title="Styles" onClick={() => toggle("style")}>
        <span className={s.cornerSwatch} style={{ background: `linear-gradient(135deg, ${preset.swatch[1]}, ${preset.swatch[2]})` }} />
      </button>
      <button className={s.cornerBtn} aria-expanded={open === "pages"} aria-label="Pages" title="Pages" onClick={() => toggle("pages")}>
        <Icon name={open === "pages" ? "close" : "menu"} size={17} />
      </button>

      {open && (
        <div className={`panel ${s.cornerMenu}`} role="menu" aria-label={open === "pages" ? "Pages" : "Styles"} data-ui="menu" data-menu={open}>
          <div className="label" data-ui="menu-title">{open === "pages" ? "Pages" : "Style"}</div>
          {open === "pages" ? (
            <>
              <Link href="/" role="menuitem" className={s.row} data-ui="menu-item" aria-current={pathname === "/" ? "page" : undefined}>
                <b data-ui="idx">00</b><Icon name="orb" /><span>Apollo<small data-ui="blurb">Home · the orb</small></span>
              </Link>
              {SPACES.map((sp) => (
                <Link key={sp.id} href={`/s/${sp.id}`} role="menuitem" className={s.row} data-ui="menu-item" aria-current={pathname === `/s/${sp.id}` ? "page" : undefined}>
                  <b data-ui="idx">{String(SPACES.indexOf(sp) + 1).padStart(2, "0")}</b><Icon name={sp.icon} /><span>{sp.name}<small data-ui="blurb">{sp.blurb}</small></span>
                </Link>
              ))}
              {made.length > 0 && <div className={`label ${s.cornerSub}`}>Made by Apollo</div>}
              {made.map((p) => (
                <Link key={p.slug} href={`/p/${p.slug}`} role="menuitem" className={s.row} data-ui="menu-item" aria-current={pathname === `/p/${p.slug}` ? "page" : undefined}>
                  <b data-ui="idx">P</b><Icon name="panel" /><span>{p.title}<small data-ui="blurb">Made by Apollo</small></span>
                </Link>
              ))}
            </>
          ) : (
            presets.map((p) => (
              <button key={p.id} role="menuitemradio" aria-checked={p.id === preset.id} className={s.row} data-ui="menu-item" onClick={() => setTheme(p.id)}>
                <span className={s.chip} style={{ background: p.swatch[0] }}>
                  <i style={{ background: p.swatch[1] }} />
                  <i style={{ background: p.swatch[2] }} />
                </span>
                <span>{p.name}<small>{p.note}</small></span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
