"use client";

import { useMemo, useState } from "react";
import { CATALOG } from "./catalog";
import type { Block } from "./spec";
import u from "./ui.module.css";

/** Toolbar shown while editing a page layout: add boxes, save, cancel, reset. */
export function LayoutToolbar({ onAdd, onSave, onCancel, onReset, saving, custom }: {
  onAdd: (b: Block) => void; onSave: () => void; onCancel: () => void; onReset: () => void; saving: boolean; custom: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const items = useMemo(() => {
    const t = q.toLowerCase();
    return CATALOG.filter((c) => !t || `${c.block.title ?? ""} ${c.block.props?.label ?? ""} ${c.block.type} ${c.page}`.toLowerCase().includes(t));
  }, [q]);
  return (
    <div className={u.layoutBar} data-ui="layout-bar">
      <span className="label">Editing layout: drag boxes, resize with − + ↥ ↧</span>
      <span className={u.row}>
        <button className="pill" onClick={() => setPicking((p) => !p)}>{picking ? "Close" : "+ Add a box"}</button>
        {custom && <button className="pill" onClick={onReset} title="Go back to the built-in layout">Reset to default</button>}
        <button className="pill" onClick={onCancel}>Cancel</button>
        <button className="pill" data-active="true" disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save layout"}</button>
      </span>
      {picking && (
        <div className={`panel ${u.catalog}`}>
          <input autoFocus placeholder="Search boxes (timer, sleep, flashcards…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul>
            {items.map((c) => (
              <li key={c.key}>
                <button onClick={() => { onAdd({ ...c.block }); setPicking(false); }}>
                  <b>{String(c.block.title ?? c.block.props?.label ?? c.block.type)}</b>
                  <small>{c.block.type} · from {c.page}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
