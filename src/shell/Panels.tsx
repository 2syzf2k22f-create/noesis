"use client";

import Link from "next/link";
import { useRef, useSyncExternalStore } from "react";
import { ORB_STATES } from "@/orb/ApolloOrb";
import { useTheme } from "@/theme/ThemeProvider";
import { useApollo } from "./apollo";
import { Icon } from "./Icon";
import { panelStore, type Panel } from "./panelStore";
import { SPACES } from "./spaces";
import s from "./shell.module.css";

function Body({ kind }: { kind: Panel["kind"] }) {
  const { preset, presets, setTheme } = useTheme();
  const { orbState, setOrbState } = useApollo();
  if (kind === "spaces")
    return (
      <nav className={s.list}>
        {SPACES.map((sp) => (
          <Link key={sp.id} href={`/s/${sp.id}`} className={s.row}>
            <Icon name={sp.icon} />
            <span>{sp.name}</span>
          </Link>
        ))}
      </nav>
    );
  if (kind === "style")
    return (
      <div className={s.list} role="listbox" aria-label="Style preset">
        {presets.map((p) => (
          <button key={p.id} role="option" aria-selected={p.id === preset.id} className={s.row} onClick={() => setTheme(p.id)}>
            <span className={s.chip} style={{ background: p.swatch[0] }}>
              <i style={{ background: p.swatch[1] }} />
              <i style={{ background: p.swatch[2] }} />
            </span>
            <span>
              {p.name}
              <small>{p.note}</small>
            </span>
          </button>
        ))}
      </div>
    );
  if (kind === "orb")
    return (
      <div className={s.pills}>
        {ORB_STATES.map((st) => (
          <button key={st} className="pill" aria-pressed={orbState === st} onClick={() => setOrbState(st)}>
            {st}
          </button>
        ))}
      </div>
    );
  return (
    <div className={s.empty}>
      <div className="display">no data</div>
      <p>{kind === "inbox" ? "Nothing has been connected to the inbox yet." : "Scores appear once there are logs to compute them from."}</p>
    </div>
  );
}

function PanelView({ p, z }: { p: Panel; z: number }) {
  const drag = useRef<{ mode: "move" | "size"; sx: number; sy: number; p: Panel } | null>(null);

  const begin = (mode: "move" | "size", e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { mode, sx: e.clientX, sy: e.clientY, p };
    panelStore.front(p.id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    panelStore.update(p.id, d.mode === "move"
      ? { x: d.p.x + dx, y: d.p.y + dy }
      : { w: Math.max(220, d.p.w + dx), h: Math.max(96, d.p.h + dy) });
  };
  const end = () => { drag.current = null; };
  const startMove = (e: React.PointerEvent) => begin("move", e);
  const startSize = (e: React.PointerEvent) => begin("size", e);

  return (
    <section
      className={`panel ${s.panel}`}
      data-slot={p.slot}
      style={{ left: p.x, top: p.y, width: p.w, height: p.h, zIndex: z }}
      aria-label={p.title}
      onPointerDown={() => panelStore.front(p.id)}
    >
      <header className={s.panelHead} onPointerDown={startMove} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <span className="label">{p.title}</span>
        <span className={s.panelTools}>
          <button aria-label={p.pinned ? "Unpin" : "Pin"} aria-pressed={p.pinned} onClick={() => panelStore.update(p.id, { pinned: !p.pinned })}>
            <Icon name="pin" size={15} />
          </button>
          <button aria-label="Close" onClick={() => panelStore.close(p.id)}>
            <Icon name="close" size={15} />
          </button>
        </span>
      </header>
      <div className={s.panelBody}>
        <Body kind={p.kind} />
      </div>
      <span className={s.grip} onPointerDown={startSize} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-hidden />
    </section>
  );
}

export function PanelLayer() {
  const panels = useSyncExternalStore(panelStore.subscribe, panelStore.get, panelStore.getServer);
  return (
    <>
      {panels.map((p, i) => (
        <PanelView key={p.id} p={p} z={30 + i} />
      ))}
    </>
  );
}
