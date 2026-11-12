"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { ApolloOrb } from "@/orb/ApolloOrb";
import { useTheme } from "@/theme/ThemeProvider";
import { ApolloProvider, useApollo } from "./apollo";
import { Backdrop } from "./Backdrop";
import { CommandPalette } from "./CommandPalette";
import { CornerMenus } from "./CornerMenus";
import { Icon } from "./Icon";
import { PanelLayer } from "./Panels";
import { ChatDock, Highlighter } from "./ChatDock";
import { SideWindows } from "./SideWindows";
import { panelStore } from "./panelStore";
import { SPACES } from "./spaces";
import s from "./shell.module.css";

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const home = pathname === "/";
  const { preset } = useTheme();
  const { orbState, getLevel, paletteOpen, setPaletteOpen } = useApollo();
  const stageRef = useRef<HTMLDivElement>(null);
  const openRef = useRef(paletteOpen);
  useEffect(() => { openRef.current = paletteOpen; }, [paletteOpen]);

  // Docking is a transform (no canvas resize), so the scale depends on the stage's size.
  useEffect(() => {
    const el = stageRef.current!;
    const set = () => el.style.setProperty("--dock-scale", String(92 / el.offsetWidth));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (pathname !== "/") panelStore.closeUnpinned();
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!openRef.current);
      } else if (e.key === "Escape" && !openRef.current) {
        panelStore.closeTop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPaletteOpen]);

  return (
    <div className={s.shell} data-home={home}>
      {home && <Backdrop />}
      <CornerMenus />
      <div className={s.orbStage} data-docked={!home} ref={stageRef}>
        <ApolloOrb className={s.orb} state={orbState} theme={preset.orb} getLevel={getLevel} small={!home} />
        {!home && <Link href="/" className={s.orbHome} aria-label="Back to Apollo" />}
      </div>

      {!home && (
        <nav className={s.nav} aria-label="Spaces" data-ui="nav">
          {SPACES.map((sp) => (
            <Link key={sp.id} href={`/s/${sp.id}`} className={s.navItem} data-ui="nav-item" aria-current={pathname === `/s/${sp.id}` ? "page" : undefined} title={sp.name}>
              <b data-ui="idx">{String(SPACES.indexOf(sp) + 1).padStart(2, "0")}</b>
              <Icon name={sp.icon} size={19} />
              <span>{sp.name}</span>
            </Link>
          ))}
        </nav>
      )}

      <div className={s.content}>{home ? children : <SideWindows>{children}</SideWindows>}</div>
      <ChatDock />
      <Highlighter />
      <PanelLayer />
      <CommandPalette />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ApolloProvider>
      <Shell>{children}</Shell>
    </ApolloProvider>
  );
}
