'use client';

import React from 'react';
import { useTheme } from 'next-themes';

export type ThemeChoice = 'system' | 'dark' | 'light';
const ORDER: ThemeChoice[] = ['system', 'dark', 'light'];
const NAME: Record<ThemeChoice, string> = { system: 'System', dark: 'Dark', light: 'Light' };

/** The mode a click (or Alt+Shift+D) moves to: System -> Dark -> Light -> System. */
export function nextTheme(current: string | undefined): ThemeChoice {
  const i = ORDER.indexOf((current ?? 'system') as ThemeChoice);
  return ORDER[(i + 1) % ORDER.length];
}

/**
 * The app's one theme control: a single button that cycles System, Dark,
 * Light and shows the icon of the current mode (the other two wait rotated
 * out, see `.theme-btn` in globals.css / landing.css). next-themes persists
 * the choice, applies it before paint and follows the OS while on System.
 * `className` carries the host's button style (`nav-btn` on the landing,
 * `icon-btn` in the editor); `showName` adds the mode's name as text.
 */
export default function ThemeToggle({ className = 'icon-btn', showName = false }: { className?: string; showName?: boolean }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const choice = (mounted && ORDER.includes(theme as ThemeChoice) ? theme : 'system') as ThemeChoice;
  const next = nextTheme(choice);
  const label = `Theme: ${NAME[choice]}. Switch to ${NAME[next]}`;

  return (
    <button type="button" className={`${className} theme-btn`} id="theme" data-choice={choice} aria-label={label} title={label} onClick={() => setTheme(next)}>
      <svg className="t-system" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1v-10" /><path d="M7 20h10" /><path d="M9 16v4" /><path d="M15 16v4" /></svg>
      <svg className="t-dark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454l0 .008" /></svg>
      <svg className="t-light" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M8 12a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" /></svg>
      {showName && <span className="theme-btn-name">{NAME[choice]}</span>}
    </button>
  );
}
