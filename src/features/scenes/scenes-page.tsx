import { PageHeading } from '../../components/ui/page-heading';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { SceneControls } from './scene-controls';

export function ScenesPage() {
  return <HomeDataBoundary>{(home) => <div className="page scenes-page">
    <PageHeading eyebrow={home.house.name} title="Scenes" description="Review what will change, then run a scene." />
    <SceneControls home={home} detailed />
    <p className="quiet-note">Unavailable controls are skipped. Each result reports the controls updated and skipped.</p>
  </div>}</HomeDataBoundary>;
}