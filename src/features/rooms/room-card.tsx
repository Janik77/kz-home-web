import { ArrowUpRight, Thermometer } from 'lucide-react';
import { Link } from 'react-router';
import type { Device, Room } from '../../domain/home';
import { isActive } from '../../domain/selectors';

export function RoomCard({ room, devices, floorName }: { room: Room; devices: Device[]; floorName: string }) {
  const sensor = devices.find((device) => device.kind === 'sensor' && device.connection === 'online');
  const active = devices.filter(isActive).length;
  const offline = devices.filter((device) => device.connection === 'offline').length;
  return <Link to={`/rooms/${room.id}`} className="room-card">
    <div className="room-card__image"><img src={room.image} alt="" style={{ objectPosition: room.imagePosition }} loading="lazy" width="800" height="520" />
      <span className="room-card__floor">{floorName}</span><span className="room-card__arrow"><ArrowUpRight size={17} aria-hidden="true" /></span>
    </div>
    <div className="room-card__body"><h3>{room.name}</h3><div className="room-card__meta"><span>{devices.length} devices · {active} active</span>
      {sensor?.kind === 'sensor' && <span className="room-card__temperature"><Thermometer size={13} aria-hidden="true" />{sensor.temperature.toFixed(0)}°</span>}</div>
      {offline > 0 && <span className="room-card__offline">{offline} offline</span>}
    </div>
  </Link>;
}
