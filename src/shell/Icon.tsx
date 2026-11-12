import { ICONS, type IconName } from "./spaces";

export function Icon({ name, size = 18 }: { name: IconName | string; size?: number }) {
  const d = ICONS[name as IconName] ?? ICONS.panel;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
