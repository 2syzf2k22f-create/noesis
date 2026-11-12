"use client";

import { useEffect, useState } from "react";
import { SPACES } from "./spaces";
import s from "./shell.module.css";

/**
 * Page header. Every skin gets the same parts; skins.css decides which show and how:
 * index number (editorial), readout strip (HUD), vertical title + barcode (terminal).
 */
export function PageHead({ slug, title, sub, kicker }: { slug: string; title: string; sub?: string; kicker: string }) {
  const i = SPACES.findIndex((x) => x.id === slug);
  const idx = i >= 0 ? String(i + 1).padStart(2, "0") : "P";
  const [now, setNow] = useState("");
  useEffect(() => {
    const f = () => setNow(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    f();
    const id = setInterval(f, 30_000);
    return () => clearInterval(id);
  }, []);
  const serial = [...slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  return (
    <header className={s.pageHead} data-ui="page-head">
      <span data-ui="page-num" aria-hidden>{idx}</span>
      <div data-ui="readout" aria-hidden>
        <span>SECTOR {idx}/{String(SPACES.length).padStart(2, "0")}</span>
        <span>NOESIS · {slug.toUpperCase()}</span>
        <span>T {now || "--:--"}</span>
        <span data-ui="status">● NOMINAL</span>
      </div>
      <div data-ui="page-title">
        <div className="label" data-ui="kicker">{kicker}</div>
        <h1 className="display">{title}</h1>
        {sub && <p className={s.spaceBlurb}>{sub}</p>}
      </div>
      <div data-ui="barcode" aria-hidden>
        <i style={{ ["--seed" as string]: serial }} />
        <span>{`${slug.toUpperCase()}//${String(serial).padStart(4, "0")}`}</span>
      </div>
    </header>
  );
}
