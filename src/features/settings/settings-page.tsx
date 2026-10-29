import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../app/theme-context';
import { PageHeading } from '../../components/ui/page-heading';
import { useRuntime } from '../../app/runtime-context';
import { Button } from '../../components/ui/button';
import { useNavigate } from 'react-router';

const options = [
  { value: 'light', label: 'Light', description: 'A fresh, bright space.', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'A calmer evening view.', icon: Moon },
  { value: 'system', label: 'System', description: 'Follow your device.', icon: Monitor },
] as const;

export function SettingsPage() {
  const theme = useTheme();
  const runtime = useRuntime();
  const navigate = useNavigate();
  return <div className="page settings-page"><PageHeading eyebrow="Preferences" title="Settings" description={runtime.mode === 'core' ? 'Appearance, account and connected home.' : 'Appearance and information about this preview.'} />
    <fieldset className="settings-panel"><legend>Appearance</legend><p>A quieter view, in the light that suits you.</p><div className="theme-options">
      {options.map(({ value, label, description, icon: Icon }) => <label className="theme-option" key={value}>
        <input type="radio" name="theme" value={value} checked={theme.preference === value} onChange={() => theme.setPreference(value)} /><span className={`theme-preview theme-preview--${value}`} aria-hidden="true"><i /><i /><i /></span><Icon size={19} aria-hidden="true" /><strong>{label}</strong><span>{description}</span>
      </label>)}
    </div></fieldset>
    {runtime.mode === 'core' ? <section className="settings-panel" aria-labelledby="account-heading"><h2 id="account-heading">Account & connection</h2><p className="account-email">Signed in as {runtime.user.email}</p>
      <label className="house-selector">Home<select value={runtime.houseId} onChange={(event) => { navigate('/'); runtime.selectHouse(event.target.value); }}>{runtime.houses.map((house) => <option key={house.id} value={house.id}>{house.name}</option>)}</select></label>
      <p>Core is connected in read-only mode. Refresh home to read current data. Device control and scene execution are not enabled.</p><p>Your session is kept in this tab’s memory. Reloading requires signing in again. Only appearance is saved in this browser.</p>
      <Button variant="secondary" onClick={runtime.logout}>Sign out</Button><div className="version-label">KZ Home <span>Web 0.5</span></div></section>
      : <section className="settings-panel" aria-labelledby="about-preview"><h2 id="about-preview">About this preview</h2><p>You’re exploring a sample home. Device controls and scenes update local sample data. Changes reset when you reload.</p><p>Only your appearance preference is saved in this browser. Choose Core mode in local configuration to sign in and view a real home.</p><div className="version-label">KZ Home <span>Web 0.5</span></div></section>}
  </div>;
}
