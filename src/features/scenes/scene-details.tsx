import type { HomeSnapshot, Scene } from '../../domain/home';
import { describeCommand } from '../../domain/selectors';
import { useRepository } from '../../app/services';

export function SceneDetails({ scene, home }: { scene: Scene; home: HomeSnapshot }) {
  const readOnly = useRepository().readOnly;
  const actions = scene.readActions ?? scene.actions.map((action) => ({ deviceId: action.deviceId, description: describeCommand(action) }));
  return <details className="scene-details"><summary>View controls ({actions.length})</summary>
    <ul>{actions.map((action, index) => {
      const device = home.devices.find((item) => item.id === action.deviceId);
      const room = home.rooms.find((item) => item.id === device?.roomId);
      const unavailable = !device || device.connection === 'offline';
      return <li key={`${action.deviceId}-${index}`}><span>{device?.name ?? 'Unavailable device'}
        <small>{room?.name ?? 'Unassigned room'}</small>{unavailable && <small className="scene-unavailable">Unavailable{!readOnly && ' · will be skipped'}</small>}</span>
        <span>{action.description}</span></li>;
    })}</ul>
  </details>;
}
