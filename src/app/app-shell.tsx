import { useEffect, useRef } from 'react';
import { House, LayoutGrid, Settings2, Layers3, Plug, Workflow, ListChecks, Ellipsis } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { Wordmark } from '../components/brand/wordmark';
import { ThemeToggle } from '../components/ui/theme-toggle';
import { NavigationEffects } from './navigation-effects';
import { useHome } from '../features/home/use-home';
import { getHomeSummary } from '../domain/selectors';
import { useRuntime } from './runtime-context';
import { Button } from '../components/ui/button';

const navigation = [
  { to: '/', label: 'Главная', icon: House },
  { to: '/rooms', label: 'Комнаты', icon: LayoutGrid },
  { to: '/scenes', label: 'Сценарии', icon: Layers3 },
  { to: '/devices', label: 'Устройства', icon: Plug },
  { to: '/automations', label: 'Правила', icon: Workflow },
  { to: '/events', label: 'Журнал', icon: ListChecks },
  { to: '/settings', label: 'Настройки', icon: Settings2 },
];

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const menu = ref.current?.querySelector('details');
    if (menu) menu.open = false;
  }, [pathname]);
  const link = ({ to, label, icon: Icon }: typeof navigation[number]) => (
    <NavLink key={to} to={to} onClick={() => { const menu = ref.current?.querySelector('details'); if (menu) menu.open = false; }} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}>
      <Icon size={21} aria-hidden="true" /><span>{label}</span>
    </NavLink>
  );
  const extra = navigation.filter(item => ['/devices', '/automations', '/events'].includes(item.to));
  return <nav ref={ref} lang="ru" aria-label={mobile ? 'Мобильная навигация' : 'Основная навигация'} className={mobile ? 'mobile-nav' : 'sidebar__nav'}>
    {mobile ? <>
      {navigation.filter(item => ['/', '/rooms', '/scenes'].includes(item.to)).map(link)}
      <details className="mobile-more"><summary className={`nav-item ${extra.some(item => item.to === pathname) ? 'nav-item--active' : ''}`}><Ellipsis size={21} aria-hidden="true" /><span>Ещё</span></summary><div className="mobile-more__links">{extra.map(link)}</div></details>
      {navigation.filter(item => item.to === '/settings').map(link)}
    </> : navigation.map(link)}
  </nav>;
}

export function AppShell() {
  const runtime = useRuntime();
  const pathname = useLocation().pathname;
  const signature = pathname === '/' || /^\/rooms\/[^/]+$/.test(pathname);
  const core = runtime.mode === 'core';
  const modeLabel = core ? 'Ваш дом' : 'Демо · без оборудования';
  const home = useHome();
  const summary = home.data ? getHomeSummary(home.data) : null;
  return (
    <div className="app-shell app-shell--everyday">
      <a lang="ru" className="skip-link" href="#main-content">К содержимому</a>
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="KZ Home — главная"><Wordmark /></Link>
        <p className="sidebar__label">ВАШЕ ПРОСТРАНСТВО</p>
        <Navigation />
        <div className="sidebar__bottom">
          <div className="sidebar__message"><House size={21} aria-hidden="true" /><p>{home.data?.house.name ?? 'Ваш дом'}<br /><span>{home.isError ? 'Данные дома недоступны' : summary ? `В сети: ${summary.online} из ${summary.total}` : 'Загружаем состояние…'}</span></p></div>

        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Link to="/" className="topbar__mobile-brand" aria-label="KZ Home — главная"><Wordmark /></Link>
          <div className="topbar__location"><House size={17} aria-hidden="true" /><span>Моё пространство</span><span className="topbar__separator">/</span><strong>{home.data?.house.name ?? 'Ваш дом'}</strong></div>
          <div className="topbar__actions"><span className="preview-badge">{modeLabel}</span>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {!signature && core && <div className="connection-bar"><span>Данные дома получены</span><div><Button variant="quiet" aria-disabled={home.isFetching} onClick={() => { if (!home.isFetching) void home.refetch(); }}>{home.isFetching ? 'Обновляем…' : 'Обновить данные'}</Button><Link className="text-link" to="/settings">Аккаунт и дома</Link></div></div>
          }
          <Outlet />
        </main>
        <footer className="app-footer"><span>KZ Home Web</span><span>{core ? 'Показаны последние полученные данные' : 'Изменения сбрасываются при перезагрузке'}</span></footer>
      </div>
      <Navigation mobile />
      <NavigationEffects />
    </div>
  );
}
