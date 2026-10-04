import { Lightbulb, Thermometer, Wifi } from 'lucide-react';
import type { HomeSnapshot } from '../../domain/home';
import { getHomeSummary } from '../../domain/selectors';

export function HomeSummary({ home }: { home: HomeSnapshot }) {
  const summary = getHomeSummary(home);
  return <dl className="home-summary" aria-label="Home status">
    <div><dt><Thermometer size={19} aria-hidden="true" />Indoor climate</dt><dd>{summary.temperature === null ? 'Unavailable' : `${summary.temperature.toFixed(1)}°`}<span>{summary.temperature === null ? 'No online sensors' : 'Average temperature'}</span></dd></div>
    <div><dt><Lightbulb size={19} aria-hidden="true" />Lighting</dt><dd>{summary.lightsOn} <span className="summary-unit">lights on</span><span>Across your home</span></dd></div>
    <div><dt><Wifi size={19} aria-hidden="true" />Connection</dt><dd>{summary.online}<span className="summary-unit"> / {summary.total} online</span><span>{summary.offline ? `${summary.offline} device ${summary.offline === 1 ? 'needs' : 'need'} attention` : 'All devices connected'}</span></dd></div>
  </dl>;
}
