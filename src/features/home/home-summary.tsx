import { Lightbulb, Thermometer, Wifi } from 'lucide-react';
import type { HomeSnapshot } from '../../domain/home';
import { getHomeSummary } from '../../domain/selectors';

export function HomeSummary({ home, readOnly = false }: { home: HomeSnapshot; readOnly?: boolean }) {
  const summary = getHomeSummary(home);
  return <dl className="home-summary" aria-label="Home status">
    <div><dt><Wifi size={19} aria-hidden="true" />Devices online</dt><dd>{summary.online}<span className="summary-unit"> / {summary.total}</span><span>{summary.offline ? `${summary.offline} offline` : summary.total ? readOnly ? 'All reported online' : 'All connected' : 'No devices yet'}</span></dd></div>
    <div><dt><Lightbulb size={19} aria-hidden="true" />Lighting</dt><dd>{summary.lightsOn} <span className="summary-unit">lights on</span><span>{readOnly ? 'Reported states' : 'Across your home'}</span></dd></div>
    <div><dt><Thermometer size={19} aria-hidden="true" />Temperature</dt><dd>{summary.temperature === null ? '—' : `${summary.temperature.toFixed(1)}°C`}<span>{summary.temperature === null ? 'No online sensors' : 'Indoor average'}</span></dd></div>
  </dl>;
}
