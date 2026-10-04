import { Sparkles } from 'lucide-react';
import { PageHeading } from '../../components/ui/page-heading';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { SceneControls } from './scene-controls';

export function ScenesPage() {
  return <HomeDataBoundary>{(home) => <div className="page scenes-page">
    <PageHeading eyebrow="SET THE FEELING" title="Small rituals. Big comfort." description="Bring your lights and curtains together with a single touch." />
    <div className="scene-intro"><Sparkles size={32} aria-hidden="true" /><div><h2>For the way you live</h2><p>A brighter morning. A softer evening. Choose a moment and your home follows along.</p></div></div>
    <SceneControls scenes={home.scenes} />
    <section className="scene-details" aria-labelledby="scene-details-title"><h2 id="scene-details-title">A look inside your scenes</h2><div className="scene-details__list">
      {home.scenes.map((scene) => <article key={scene.id}><h3>{scene.name}</h3><p>{scene.actions.length} controls</p><ul>{scene.actions.map((action, index) => {
        const device = home.devices.find((item) => item.id === action.deviceId);
        const room = home.rooms.find((item) => item.id === device?.roomId);
        const value = action.type === 'set-power' ? action.on ? 'On' : 'Off' : action.type === 'set-brightness' ? `${action.brightness}% brightness` : `${action.position}% open`;
        return <li key={`${action.deviceId}-${index}`}><span>{device?.name ?? 'Unavailable device'}<small>{room?.name ?? 'Unassigned room'}</small></span><span>{value}</span></li>;
      })}</ul></article>)}
    </div></section><p className="quiet-note">Scenes use sample devices. Offline devices are skipped and reported after activation.</p>
  </div>}</HomeDataBoundary>;
}
