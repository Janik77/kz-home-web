import type { HomeSnapshot, Scene } from '../../domain/home';
import { describeCommand } from '../../domain/selectors';
import { useRepository } from '../../app/services';

export function SceneDetails({ scene, home }: { scene: Scene; home: HomeSnapshot }) {
  const readOnly = useRepository().readOnly;
  const actions = scene.readActions ?? scene.actions.map((action) => ({ deviceId: action.deviceId, description: describeCommand(action) }));
  return <details className="scene-details"><summary>Действия ({actions.length})</summary>
    <p className="scene-card__description">{scene.description}</p>
    <ul>{actions.map((action, index) => {
      if('waitSeconds' in action && typeof action.waitSeconds === 'number') return <li key={index}><span>Сохранённая пауза</span><span>{action.waitSeconds} с после подтверждения предыдущего действия</span></li>;
      if('unsupported' in action && action.unsupported) return <li key={index}><span>Только просмотр</span><span>{action.description}</span></li>;
      const device = home.devices.find((item) => item.id === action.deviceId);
      const room = home.rooms.find((item) => item.id === device?.roomId);
      const unavailable = !device || device.connection === 'offline';
      return <li key={`${action.deviceId}-${index}`}><span>{device?.name ?? 'Устройство недоступно'}
        <small>{room?.name ?? 'Комната не указана'}</small>{unavailable && <small className="scene-unavailable">Недоступно{!readOnly && ' · будет пропущено'}</small>}</span>
        <span>{action.description}</span></li>;
    })}</ul>
  </details>;
}
