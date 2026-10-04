import { PageHeading } from '../../components/ui/page-heading';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { SceneControls } from './scene-controls';
import { useRepository } from '../../app/services';

export function ScenesPage() {
  const readOnly = useRepository().readOnly;
  return <HomeDataBoundary>{(home) => <div className="page scenes-page">
    <PageHeading eyebrow={home.house.name} title="Scenes" description={readOnly ? 'Review the scenes available to your account. Execution is not enabled.' : 'Review what will change, then run a scene.'} />
    <SceneControls home={home} detailed />
    <p className="quiet-note">{readOnly ? 'Core lists only scenes your account may read. An empty list can also reflect your house permissions.' : 'Unavailable controls are skipped. Each result reports the controls updated and skipped.'}</p>
  </div>}</HomeDataBoundary>;
}
