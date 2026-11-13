import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../app/theme-context';

export function ThemeToggle() {
  const theme = useTheme();
  const next = theme.resolved === 'light' ? 'dark' : 'light';
  return <button className="icon-button" type="button" aria-label={next === 'dark' ? 'Включить тёмную тему' : 'Включить светлую тему'} onClick={() => theme.setPreference(next)}>
    {next === 'dark' ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
  </button>;
}
