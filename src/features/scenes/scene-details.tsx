import type { HomeSnapshot, Scene } from '../../domain/home';
import { describeCommand } from '../../domain/selectors';

export function SceneDetails({ scene, home }: { scene: Scene; home: HomeSnapshot }) {
  return <details className="scene-details"><summary>View controls ({scene.actions.length})</summary>
    <ul>{scene.actions.map((action, index) => {
      const device = home.devices.find((item) => item.id === action.deviceId);
      const room = home.rooms.find((item) => item.id === device?.roomId);
      const unavailable = !device || device.connection === 'offline';
      return <li key={`${action.deviceId}-${index}`}><span>{device?.name ?? 'Unavailable device'}
        <small>{room?.name ?? 'Unassigned room'}</small>{unavailable && <small className="scene-unavailable">Unavailable · will be skipped</small>}</span>
        <span>{describeCommand(action)}</span></li>;
    })}</ul>
  </details>;
}