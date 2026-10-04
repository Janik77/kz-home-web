import { ArrowUpRight, Thermometer } from 'lucide-react';
import { Link } from 'react-router';
import type { Device, Room } from '../../domain/home';
import { getRoomSummary } from '../../domain/selectors';
import { StatusBadge } from '../../components/ui/status-badge';

export function RoomCard({ room, devices, floorName, headingLevel = 3 }: { room: Room; devices: Device[]; floorName: string; headingLevel?: 2 | 3 }) {
  const summary = getRoomSummary(devices);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <Link to={`/rooms/${room.id}`} className="room-card">
    <div className="room-card__image"><img src={room.image} alt="" style={{ objectPosition: room.imagePosition }} loading="lazy" width="800" height="520" />
      <span className="room-card__floor">{floorName}</span><span className="room-card__arrow"><ArrowUpRight size={17} aria-hidden="true" /></span>
    </div>
    <div className="room-card__body"><Heading>{room.name}</Heading><div className="room-card__meta"><span>{summary.total} devices · {summary.active} active</span>
      {summary.temperature !== null && <span className="room-card__temperature"><Thermometer size={13} aria-hidden="true" />{summary.temperature.toFixed(1)}°C</span>}</div>
      <StatusBadge online={summary.offline === 0} label={summary.total === 0 ? 'No devices' : summary.offline ? `${summary.offline} offline · ${summary.online} online` : `${summary.online} online`} />
    </div>
  </Link>;
}
