import { Link } from 'react-router';
import type { Device, Room } from '../../domain/home';
import { Feedback } from '../../components/ui/feedback';

export function AvailabilityNotice({ devices, rooms, readOnly = false }: { devices: Device[]; rooms: Room[]; readOnly?: boolean }) {
  const offline = devices.filter((device) => device.connection === 'offline');
  if (!offline.length) return null;
  const allOffline = offline.length === devices.length;
  return <Feedback tone={allOffline ? 'offline' : 'warning'}
    message={readOnly ? `${offline.length} ${offline.length === 1 ? 'device is' : 'devices are'} reported offline by Core. Last-known states are shown.` : allOffline ? 'All devices are offline. Controls are unavailable until they reconnect.' : `${offline.length} ${offline.length === 1 ? 'device is' : 'devices are'} offline. Your other devices are available.`}>
    <details className="availability-details"><summary>View {offline.length === 1 ? 'offline device' : `offline devices (${offline.length})`}</summary>
      <ul>{offline.map((device) => {
        const room = rooms.find((item) => item.id === device.roomId);
        return <li key={device.id}>{room ? <Link to={`/rooms/${room.id}#device-${device.id}`}>{device.name}<span>{room.name} · View room</span></Link> : <span>{device.name} · Unassigned room</span>}</li>;
      })}</ul>
    </details>
  </Feedback>;
}
