import { useRepository } from '../../app/services';
import { CoreSceneRun } from './core-scene-run';
import { Link } from 'react-router';
import { RenameDefinition } from '../definitions/definition-forms';
import { DoorOpen, Moon, Sofa, Sunrise, Layers } from 'lucide-react';
import type { HomeSnapshot } from '../../domain/home';
import { getSceneSummary } from '../../domain/selectors';
import { StatePanel } from '../../components/ui/state-panel';
import { Button } from '../../components/ui/button';
import { Feedback } from '../../components/ui/feedback';
import { useHomeControls } from '../home/use-home';
import { SceneDetails } from './scene-details';
import { sceneFeedback } from './scene-result';

const icons = { sunrise: Sunrise, sofa: Sofa, moon: Moon, away: DoorOpen, scene: Layers };

export function SceneControls({ home, detailed = false }: { home: HomeSnapshot; detailed?: boolean }) {
  const durable = useRepository().sceneRuns;
  const { scene, pending, readOnly } = useHomeControls();
  const Heading = detailed ? 'h2' : 'h3';
  if (!home.scenes.length) return <StatePanel kind="empty" title="Сценариев пока нет" description="Сценарии появятся после добавления в дом." />;
  return <div className={`scene-grid ${detailed ? 'scene-grid--detailed' : ''}`}>
    {home.scenes.map((item) => {
      const Icon = icons[item.icon];
      const scope = getSceneSummary(item, home);
      const selected = scene.variables === item.id;
      const result = selected && scene.isSuccess ? sceneFeedback(item.name, scene.data) : null;
      return <article key={item.id} className={`scene-card scene-card--${item.icon} ${result?.tone === 'success' ? 'scene-card--applied' : ''}`} aria-label={item.name}>
        <div className="scene-card__top"><span className="scene-card__icon"><Icon size={23} aria-hidden="true" /></span>
          <span className="scene-card__scope">Устройств: {scope.deviceCount} · комнат: {scope.rooms.length}</span></div>
        <Heading className="scene-card__name">{item.name}</Heading>

        {scope.unavailableControls > 0 && <p className="scene-unavailable">Недоступно: {scope.unavailableControls}</p>}
        <SceneDetails scene={item} home={home} />
        {readOnly ? (detailed && durable ? <details className="core-scene-shell"><summary>Запуск и результат</summary><CoreSceneRun scene={item} home={home} /></details> : <p className="quiet-note">Подтверждённый запуск — на странице сценариев</p>) : <Button variant="secondary" className="scene-card__run" aria-label={`Запустить ${item.name}`} aria-disabled={pending}
          onClick={() => { if (!pending) scene.mutate(item.id); }}>{selected && scene.isPending ? 'Выполняем…' : 'Запустить'}</Button>}
        {readOnly && !detailed && <Link className="text-link" to="/scenes">Подробнее</Link>}
        {readOnly && detailed && <RenameDefinition kind="scenes" id={item.id} name={item.name} revision={item.revision} />}
        <div className="scene-card__feedback">
          {selected && scene.isPending && <Feedback tone="pending" message={`Симуляция: ${item.name}…`} />}
          {result && <Feedback tone={result.tone} message={result.message + ' Только симуляция.'} />}
          {selected && scene.isError && <Feedback tone="error" message={`Не удалось запустить ${item.name}. Проверьте устройства и повторите.`} />}
        </div>
      </article>;
    })}
  </div>;
}
