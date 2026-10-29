import { House, LayoutGrid, Settings2, Layers3, FlaskConical } from 'lucide-react';
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
  { to: '/settings', label: 'Настройки', icon: Settings2 },
];

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return <nav lang="ru" aria-label={mobile ? 'Mobile navigation' : 'Main navigation'} className={mobile ? 'mobile-nav' : 'sidebar__nav'}>
    {navigation.map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}>
        <Icon size={21} aria-hidden="true" /><span>{label}</span>
      </NavLink>
    ))}
  </nav>;
}

export function AppShell() {
  const runtime = useRuntime();
  const signature = useLocation().pathname === '/';
  const core = runtime.mode === 'core';
  const modeLabel = core ? 'Core · Read only' : 'Local preview';
  const home = useHome();
  const summary = home.data ? getHomeSummary(home.data) : null;
  return (
    <div className={`app-shell ${signature ? 'signature-shell' : ''}`}>
      <a lang="ru" className="skip-link" href="#main-content">К содержимому</a>
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="KZ Home — home"><Wordmark /></Link>
        <p className="sidebar__label">ВАШЕ ПРОСТРАНСТВО</p>
        <Navigation />
        <div className="sidebar__bottom">
          <div className="sidebar__message"><House size={21} aria-hidden="true" /><p>{home.data?.house.name ?? 'Your home'}<br /><span>{home.isError ? 'Home data unavailable' : summary ? `${summary.online} of ${summary.total} ${core ? 'reported online' : 'sample devices online'}` : 'Loading home status…'}</span></p></div>
          <div className="preview-note"><span className="status-dot" /><span>{core ? 'Core · только просмотр' : 'Демо · симуляция'}</span></div>
          <p className="sidebar__footnote">{core ? 'Без команд устройствам' : 'Без реального оборудования'}</p>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Link to="/" className="topbar__mobile-brand" aria-label="KZ Home — home"><Wordmark /></Link>
          <div className="topbar__location"><House size={17} aria-hidden="true" /><span>My space</span><span className="topbar__separator">/</span><strong>{home.data?.house.name ?? 'Your home'}</strong></div>
          <div className="topbar__actions"><span className="preview-badge">{modeLabel}</span>
            <ThemeToggle />
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {!signature && (core ? <div className="connection-bar"><span>Core · Read only · reported state</span><div><Button variant="quiet" aria-disabled={home.isFetching} onClick={() => { if (!home.isFetching) void home.refetch(); }}>{home.isFetching ? 'Refreshing…' : 'Refresh home'}</Button><Link className="text-link" to="/settings">Account & homes</Link></div></div>
            : <div className="mode-notice"><FlaskConical size={14} aria-hidden="true" /><span>Local preview · Simulation <span className="mode-notice__detail">· Sample home</span></span></div>)}
          <Outlet />
        </main>
        <footer className="app-footer"><span>KZ Home · 0.5</span><span>{core ? 'Данные Core · актуальность неизвестна' : 'Симуляция · сброс при перезагрузке'}</span></footer>
      </div>
      <Navigation mobile />
      <NavigationEffects />
    </div>
  );
}
