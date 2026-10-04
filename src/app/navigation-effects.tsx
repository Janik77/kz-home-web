import { useEffect } from 'react';
import { useLocation } from 'react-router';

const titles: Record<string, string> = { '/': 'Your home', '/rooms': 'Rooms', '/scenes': 'Scenes', '/settings': 'Settings' };

export function NavigationEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `KZ Home · ${titles[pathname] ?? (pathname.startsWith('/rooms/') ? 'Room' : 'Page not found')}`;
    window.scrollTo({ top: 0, behavior: 'instant' });
    // The container always exists, including during async route loading.
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
