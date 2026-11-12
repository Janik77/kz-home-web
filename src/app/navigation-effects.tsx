import { useEffect } from 'react';
import { useLocation } from 'react-router';

const titles: Record<string, string> = { '/': 'Ваш дом', '/rooms': 'Комнаты', '/scenes': 'Сценарии', '/settings': 'Настройки', '/devices': 'Устройства', '/automations': 'Автоматизации', '/events': 'Журнал событий' };

export function NavigationEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = `KZ Home · ${titles[pathname] ?? (pathname.startsWith('/rooms/') ? 'Комната' : 'Страница не найдена')}`;
    const target = hash ? document.getElementById(hash.slice(1)) : null;
    if (target) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      target.focus({ preventScroll: true });
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);
  return null;
}
