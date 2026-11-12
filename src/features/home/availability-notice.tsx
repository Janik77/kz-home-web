import { Link } from 'react-router';
import type { Device, Room } from '../../domain/home';
import { Feedback } from '../../components/ui/feedback';

export function AvailabilityNotice({ devices, rooms, readOnly = false }: { devices: Device[]; rooms: Room[]; readOnly?: boolean }) {
  const offline = devices.filter((device) => device.connection === 'offline');
  if (!offline.length) return null;
  const allOffline = offline.length === devices.length;
  return <Feedback tone={allOffline ? 'offline' : 'warning'}
    message={readOnly ? `По данным Core, не в сети: ${offline.length}. Показаны последние известные состояния.` : allOffline ? 'Все устройства не в сети. Управление недоступно до восстановления связи.' : `Не в сети: ${offline.length}. Остальные устройства доступны.`}>
    <details className="availability-details"><summary>Устройства не в сети ({offline.length})</summary>
      <ul>{offline.map((device) => {
        const room = rooms.find((item) => item.id === device.roomId);
        return <li key={device.id}>{room ? <Link to={`/rooms/${room.id}#device-${device.id}`}>{device.name}<span>{room.name} · Открыть комнату</span></Link> : <span>{device.name} · Комната не указана</span>}</li>;
      })}</ul>
    </details>
  </Feedback>;
}
