import { CreateScene } from '../definitions/definition-forms';
import { PageHeading } from '../../components/ui/page-heading';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { SceneControls } from './scene-controls';
import { useRepository } from '../../app/services';

export function ScenesPage() {
  const readOnly = useRepository().readOnly;
  return <HomeDataBoundary>{(home) => <div className="page everyday-page scenes-page">
    <PageHeading eyebrow={home.house.name} title="Сценарии" description={readOnly ? 'Подготовьте действия и выполните их по шагам. Результат каждого шага проверяется отдельно.' : 'Посмотрите действия, затем запустите симуляцию сценария.'} />
    <CreateScene home={home} />
    <SceneControls home={home} detailed />
    <p className="quiet-note">{readOnly ? 'Core возвращает только доступные сценарии. Пустой список также может означать ограничение прав.' : 'Недоступные команды пропускаются. Результат показывает выполненные и пропущенные действия.'}</p>
  </div>}</HomeDataBoundary>;
}
