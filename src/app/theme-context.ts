import { createContext, useContext } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export const themeStorageKey = 'kz-home-theme';
export const ThemeContext = createContext<{
  preference: ThemePreference;
  resolved: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
} | null>(null);

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Theme provider is missing.');
  return theme;
}
