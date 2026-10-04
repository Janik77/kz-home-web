import { House, LayoutGrid, Moon, Settings2, Sparkles, Sun } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { Wordmark } from '../components/brand/wordmark';
import { useTheme } from './theme-context';
import { NavigationEffects } from './navigation-effects';
import { useHome } from '../features/home/use-home';
import { getHomeSummary } from '../domain/selectors';

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
          <div className="preview-note"><span className="status-dot" /><span>Local preview</span></div>
          <p className="sidebar__footnote">Sample home · simulated controls</p>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <Link to="/" className="topbar__mobile-brand" aria-label="KZ Home — home"><Wordmark /></Link>
          <div className="topbar__location"><House size={17} aria-hidden="true" /><span>My space</span><span className="topbar__separator">/</span><strong>{home.data?.house.name ?? 'Your home'}</strong></div>
          <div className="topbar__actions"><span className="preview-badge">Local preview</span>
            <button className="icon-button" type="button" aria-label={`Use ${theme.resolved === 'light' ? 'dark' : 'light'} theme`}
              onClick={() => theme.setPreference(theme.resolved === 'light' ? 'dark' : 'light')}>
              {theme.resolved === 'light' ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
            </button>
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}><Outlet /></main>
        <footer className="app-footer"><span>KZ Home · 0.2</span><span>Local preview · changes reset on reload</span></footer>
      </div>
      <Navigation mobile />
      <NavigationEffects />
    </div>
  );
}
