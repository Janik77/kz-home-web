import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeContext, themeStorageKey } from './theme-context';
import type { ThemePreference } from './theme-context';

function readPreference(): ThemePreference {
  try {
    const value = localStorage.getItem(themeStorageKey);
    if (value === 'light' || value === 'dark') return value;
  } catch { /* Storage is optional; in-memory preference still works. */ }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  const resolved = preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#151b18' : '#f6f7f4');
    try { localStorage.setItem(themeStorageKey, preference); } catch { /* Optional persistence. */ }
  }, [preference, resolved]);
  return <ThemeContext.Provider value={{ preference, resolved, setPreference }}>{children}</ThemeContext.Provider>;
}
