import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../../app/theme-context';
import { PageHeading } from '../../components/ui/page-heading';

const options = [
  { value: 'light', label: 'Light', description: 'A fresh, bright space.', icon: Sun },
  { value: 'dark', label: 'Dark', description: 'A calmer evening view.', icon: Moon },
  { value: 'system', label: 'System', description: 'Follow your device.', icon: Monitor },
] as const;

export function SettingsPage() {
  const theme = useTheme();
  return <div className="page settings-page"><PageHeading eyebrow="MAKE IT YOURS" title="Your preferences." description="A few thoughtful details, just for you." />
    <fieldset className="settings-panel"><legend>Appearance</legend><p>Choose how KZ Home feels on this device.</p><div className="theme-options">
      {options.map(({ value, label, description, icon: Icon }) => <label className="theme-option" key={value}>
        <input type="radio" name="theme" value={value} checked={theme.preference === value} onChange={() => theme.setPreference(value)} /><Icon size={24} aria-hidden="true" /><strong>{label}</strong><span>{description}</span>
      </label>)}
    </div></fieldset>
    <section className="settings-panel" aria-labelledby="about-preview"><h2 id="about-preview">About this preview</h2><p>You’re exploring a sample home. Device controls and scenes update local sample data. Changes reset when you reload.</p><p>Only your appearance preference is saved in this browser. Real home connections, accounts, and device setup will be added in future milestones.</p><div className="version-label">KZ Home <span>Foundation 0.1</span></div></section>
  </div>;
}
