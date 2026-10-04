import { House, LayoutGrid, Moon, Settings2, Sparkles, Sun } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { Wordmark } from '../components/brand/wordmark';
import { useTheme } from './theme-context';
import { NavigationEffects } from './navigation-effects';
import { useHome } from '../features/home/use-home';
import { getHomeSummary } from '../domain/selectors';
import { useRuntime } from './runtime-context';
import { Button } from '../components/ui/button';

const navigation = [
  { to: '/', label: 'Home', icon: House },
  { to: '/rooms', label: 'Rooms', icon: LayoutGrid },
  { to: '/scenes', label: 'Scenes', icon: Sparkles },
  { to: '/settings', label: 'Settings', icon: Settings2 },
];

function Navigation({ mobile = false }: { mobile?: boolean }) {
  return <nav aria-label={mobile ? 'Mobile navigation' : 'Main navigation'} className={mobile ? 'mobile-nav' : 'sidebar__nav'}>
    {navigation.map(({ to, label, icon: Icon }) => (
      <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}>
        <Icon size={21} aria-hidden="true" /><span>{label}</span>
      </NavLink>
    ))}
  </nav>;
}

export function AppShell() {
  const theme = useTheme();
  const runtime = useRuntime();
  const core = runtime.mode === 'core';
  const modeLabel = core ? 'Core · Read only' : 'Local preview';
  const home = useHome();
  const summary = home.data ? getHomeSummary(home.data) : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar">
        <Link to="/" className="brand-link" aria-label="KZ Home — home"><Wordmark /></Link>
        <p className="sidebar__label">YOUR SPACE</p>
        <Navigation />
        <div className="sidebar__bottom">
          <div className="sidebar__message"><House size={21} aria-hidden="true" /><p>{home.data?.house.name ?? 'Your home'}<br /><span>{summary ? `${summary.online} of ${summary.total} devices online` : 'Loading home status…'}</span></p></div>
          <div className="preview-note"><span className="status-dot" /><span>{modeLabel}</span></div>
          <p className="sidebar__footnote">{core ? 'Reported data · controls not enabled' : 'Sample home · simulated controls'}</p>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Link to="/" className="topbar__mobile-brand" aria-label="KZ Home — home"><Wordmark /></Link>
          <div className="topbar__location"><House size={17} aria-hidden="true" /><span>My space</span><span className="topbar__separator">/</span><strong>{home.data?.house.name ?? 'Your home'}</strong></div>
          <div className="topbar__actions"><span className="preview-badge">{modeLabel}</span>
            <button className="icon-button" type="button" aria-label={`Use ${theme.resolved === 'light' ? 'dark' : 'light'} theme`}
              onClick={() => theme.setPreference(theme.resolved === 'light' ? 'dark' : 'light')}>
              {theme.resolved === 'light' ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {core && <div className="connection-bar"><span>Core · Read only · reported state</span><div><Button variant="quiet" aria-disabled={home.isFetching} onClick={() => { if (!home.isFetching) void home.refetch(); }}>{home.isFetching ? 'Refreshing…' : 'Refresh home'}</Button><Link className="text-link" to="/settings">Account & homes</Link></div></div>}
          <Outlet />
        </main>
        <footer className="app-footer"><span>KZ Home · 0.3</span><span>{core ? 'Core data · refresh to check for changes' : 'Local preview · changes reset on reload'}</span></footer>
      </div>
      <Navigation mobile />
      <NavigationEffects />
    </div>
  );
}
