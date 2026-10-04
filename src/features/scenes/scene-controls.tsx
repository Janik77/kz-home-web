import { ArrowUpRight, Check, DoorOpen, LoaderCircle, Moon, Sofa, Sunrise } from 'lucide-react';
import type { Scene } from '../../domain/home';
import { InlineError, StatePanel } from '../../components/ui/state-panel';
import { useHomeControls } from '../home/use-home';

const icons = { sunrise: Sunrise, sofa: Sofa, moon: Moon, away: DoorOpen };

export function SceneControls({ scenes }: { scenes: Scene[] }) {
  const { scene, pending } = useHomeControls();
  if (!scenes.length) return <StatePanel kind="empty" title="A rhythm of your own" description="Your scenes will appear here once they are added to your home." />;
  const activated = scenes.find((item) => item.id === scene.variables);
  return <>
    <div className="scene-grid">
      {scenes.map((item) => {
        const Icon = icons[item.icon];
        const applying = scene.isPending && scene.variables === item.id;
        const applied = scene.isSuccess && scene.variables === item.id;
        return <button type="button" key={item.id} className={`scene-card scene-card--${item.icon} ${applied ? 'scene-card--applied' : ''}`}
          disabled={pending} onClick={() => scene.mutate(item.id)} aria-label={`Activate ${item.name}`}>
          <span className="scene-card__top"><span className="scene-card__icon"><Icon size={23} aria-hidden="true" /></span>
            {applying ? <LoaderCircle className="spin" size={17} aria-hidden="true" /> : applied ? <Check size={17} aria-hidden="true" /> : <ArrowUpRight size={17} aria-hidden="true" />}</span>
          <span className="scene-card__name">{item.name}</span><span className="scene-card__description">{item.description}</span>
        </button>;
      })}
    </div>
    <div className="scene-feedback" aria-live="polite" aria-atomic="true">
      {scene.isPending && <span>Applying {activated?.name}…</span>}
      {scene.isSuccess && <span><Check size={14} aria-hidden="true" />{activated?.name} applied · {scene.data.applied} controls updated{scene.data.skipped > 0 ? ` · ${scene.data.skipped} offline ${scene.data.skipped === 1 ? 'device' : 'devices'} skipped` : ''}.</span>}
    </div>
    {scene.isError && <InlineError message={scene.error.message} />}
  </>;
}
