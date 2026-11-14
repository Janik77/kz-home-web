import { ArrowLeft, Power, Thermometer } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { DeviceGrid } from '../devices/device-grid';
import { EverydayHeader, QuickScenes, RoomConnection, SectionTitle } from '../home/everyday-sections';
import { getRoomSummary } from '../../domain/selectors';
export function RoomPage() {
  const { roomId } = useParams();
  return <HomeDataBoundary household>{home => {
    const room = home.rooms.find(item => item.id === roomId);
    if (!room) return <div className="everyday-page"><h1>Комната не найдена</h1><Link className="text-link" to="/rooms">Все комнаты</Link></div>;
    const devices = home.devices.filter(d => d.roomId === room.id); const summary = getRoomSummary(devices);
    const ids = new Set(devices.map(d => d.id));
    const scenes = home.scenes.filter(s => (s.readActions ?? s.actions).some(a => ids.has(a.deviceId)));
    return <div className="everyday-page everyday-room-page"><Link className="everyday-back" to="/rooms"><ArrowLeft size={18} aria-hidden="true" />Все комнаты</Link>
      <EverydayHeader home={home} title={room.name} subtitle={home.floors.find(f => f.id === room.floorId)?.name ?? home.house.name} />
      <div className="everyday-room-summary" aria-label="Состояние комнаты"><RoomConnection online={summary.online} total={summary.total} /><span><Power size={17} aria-hidden="true" />Активно: {summary.active}</span>{summary.temperature !== null && <span><Thermometer size={17} aria-hidden="true" />{summary.temperature.toFixed(1)} °C</span>}</div>
      <section className="everyday-devices"><SectionTitle title="Устройства" />{devices.length ? <DeviceGrid devices={devices} rooms={home.rooms} everyday /> : <p className="everyday-empty">В этой комнате пока нет устройств.</p>}</section>
      {scenes.length ? <QuickScenes home={{ ...home, scenes }} /> : <p className="everyday-empty">Для этой комнаты нет доступных сценариев. <Link to="/scenes">Все сценарии</Link></p>}
    </div>;
  }}</HomeDataBoundary>;
}
