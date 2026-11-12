import { ICONS, type IconName } from "./spaces";

/** Thin-line icons. Stroke weight, caps and joins come from the theme's skin (see skins.css). */
export function Icon({ name, size = 18 }: { name: IconName | string; size?: number }) {
  const d = ICONS[name as IconName] ?? ICONS.panel;
  return (
    <svg data-ui="icon" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" aria-hidden
      style={{ strokeWidth: "var(--icon-stroke, 1.5)", strokeLinecap: "var(--icon-cap, round)" as "round", strokeLinejoin: "var(--icon-join, round)" as "round" }}>
      <path d={d} />
    </svg>
  );
}
