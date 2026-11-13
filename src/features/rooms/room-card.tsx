import { ArrowUpRight, Thermometer } from 'lucide-react';
import { Link } from 'react-router';
import type { Device, Room } from '../../domain/home';
import { getRoomSummary } from '../../domain/selectors';
import { InteriorPhoto } from '../../components/ui/interior-photo';
import { StatusBadge } from '../../components/ui/status-badge';

export function RoomCard({ room, devices, floorName, headingLevel = 3 }: { room: Room; devices: Device[]; floorName: string; headingLevel?: 2 | 3 }) {
  const summary = getRoomSummary(devices);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <Link to={`/rooms/${room.id}`} className="room-card">
    <div className={`room-card__image ${room.image ? '' : 'room-card__image--empty'}`}><InteriorPhoto src={room.image} position={room.imagePosition} />
      <span className="room-card__floor">{floorName}</span><span className="room-card__arrow"><ArrowUpRight size={17} aria-hidden="true" /></span>
    </div>
    <div className="room-card__body"><div className="room-card__title"><Heading>{room.name}</Heading>{summary.temperature !== null && <span className="room-card__temperature"><Thermometer size={13} aria-hidden="true" />{summary.temperature.toFixed(1)}°C</span>}</div><div className="room-card__meta"><span>Устройств: {summary.total} · активно: {summary.active}</span></div>
      <StatusBadge online={summary.offline === 0} label={summary.total === 0 ? 'Нет устройств' : summary.offline ? `Не в сети: ${summary.offline} · в сети: ${summary.online}` : `В сети: ${summary.online}`} />
    </div>
  </Link>;
}
