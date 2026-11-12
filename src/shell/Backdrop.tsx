import s from "./shell.module.css";

/**
 * Home background: a fine dot field and a few faint orbit lines that frame the orb.
 * Colours come from the theme tokens. Kept out of the orb's own disc so the canvas edge never shows.
 */
export function Backdrop() {
  const rings = [0.62, 0.8, 1.02, 1.3, 1.66];
  return (
    <div className={s.backdrop} aria-hidden>
      <div className={s.dots} data-ui="dots" />
      <svg data-ui="orbits" className={s.orbits} viewBox="-100 -100 200 200" preserveAspectRatio="xMidYMid slice">
        {rings.map((r, i) => (
          <ellipse key={r} cx="0" cy="0" rx={60 * r} ry={60 * r * 0.34} style={{ ["--i" as string]: i }} />
        ))}
      </svg>
      <div className={s.vignette} />
    </div>
  );
}
