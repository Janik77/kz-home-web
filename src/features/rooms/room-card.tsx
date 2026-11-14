import { DoorOpen, ChevronRight, Thermometer } from 'lucide-react';
import { Link } from 'react-router';
import type { Device, Room } from '../../domain/home';
import { getRoomSummary } from '../../domain/selectors';
export function RoomCard({ room, devices, floorName, headingLevel = 3 }: { room: Room; devices: Device[]; floorName: string; headingLevel?: 2 | 3 }) {
 const summary = getRoomSummary(devices), Heading = headingLevel === 2 ? 'h2' : 'h3';
 return <Link to={`/rooms/${room.id}`} className="room-card room-card--everyday"><DoorOpen size={24} aria-hidden="true" /><div><p className="everyday-eyebrow">{floorName}</p><Heading>{room.name}</Heading><p>Устройств: {summary.total}{summary.active ? ` · активно: ${summary.active}` : ''}</p><p className={summary.offline ? 'room-offline' : 'quiet-note'}>{!summary.total ? 'Пока без устройств' : summary.offline ? `Нет связи: ${summary.offline}` : `В сети: ${summary.online}`}</p>{summary.temperature !== null && <span><Thermometer size={16} aria-hidden="true" /> {summary.temperature.toFixed(1)} °C</span>}</div><ChevronRight size={18} aria-hidden="true" /></Link>;
}
