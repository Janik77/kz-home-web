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
  const { scene, pending, readOnly } = useHomeControls();
  const Heading = detailed ? 'h2' : 'h3';
  if (!home.scenes.length) return <StatePanel kind="empty" title="No scenes yet" description="Scenes will appear here once they are added to your home." />;
  return <div className={`scene-grid ${detailed ? 'scene-grid--detailed' : ''}`}>
    {home.scenes.map((item) => {
      const Icon = icons[item.icon];
      const scope = getSceneSummary(item, home);
      const selected = scene.variables === item.id;
      const result = selected && scene.isSuccess ? sceneFeedback(item.name, scene.data) : null;
      return <article key={item.id} className={`scene-card scene-card--${item.icon} ${result?.tone === 'success' ? 'scene-card--applied' : ''}`} aria-label={item.name}>
        <div className="scene-card__top"><span className="scene-card__icon"><Icon size={23} aria-hidden="true" /></span>
          <span className="scene-card__scope">{scope.deviceCount} devices · {scope.rooms.length} rooms</span></div>
        <Heading className="scene-card__name">{item.name}</Heading><p className="scene-card__description">{item.description}</p>
        <p className="scene-card__rooms">{scope.rooms.map((room) => room.name).join(' · ') || 'No assigned rooms'}</p>
        {scope.unavailableControls > 0 && <p className="scene-unavailable">{scope.unavailableControls} {scope.unavailableControls === 1 ? 'control' : 'controls'} unavailable{!readOnly && ' · will be skipped'}</p>}
        {detailed && <SceneDetails scene={item} home={home} />}
        {readOnly ? <p className="quiet-note">Read only · scene execution isn’t enabled</p> : <Button variant="secondary" className="scene-card__run" aria-label={`Activate ${item.name}`} aria-disabled={pending}
          onClick={() => { if (!pending) scene.mutate(item.id); }}>{selected && scene.isPending ? 'Running…' : 'Run scene'}</Button>}
        <div className="scene-card__feedback">
          {selected && scene.isPending && <Feedback tone="pending" message={`Running ${item.name}… Waiting for confirmation.`} />}
          {result && <Feedback tone={result.tone} message={result.message} />}
          {selected && scene.isError && <Feedback tone="error" message={`Couldn’t run ${item.name}. Check your devices and try again.`} />}
        </div>
      </article>;
    })}
  </div>;
}
