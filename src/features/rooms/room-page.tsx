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
    return <div className="everyday-page everyday-room-page"><div className="everyday-room-heading"><Link className="everyday-room-back" to="/rooms" aria-label="Все комнаты"><ArrowLeft size={20} aria-hidden="true" /></Link>
      <EverydayHeader home={home} title={room.name} subtitle={home.floors.find(f => f.id === room.floorId)?.name ?? home.house.name} /></div>
      <section className={`everyday-devices ${devices.length === 1 ? 'everyday-devices--single' : ''}`}><div className="everyday-room-device-heading"><SectionTitle title="Устройства" /><div className="everyday-room-summary" aria-label="Состояние комнаты">{summary.total > 0 ? <RoomConnection online={summary.online} total={summary.total} /> : <span>Пока не добавлены</span>}{summary.total > 0 && <span><Power size={17} aria-hidden="true" />Активно: {summary.active}</span>}{summary.temperature !== null && <span><Thermometer size={17} aria-hidden="true" />{summary.temperature.toFixed(1)} °C</span>}</div></div>{devices.length ? <DeviceGrid devices={devices} rooms={home.rooms} everyday /> : <p className="everyday-empty">В этой комнате пока нет устройств.</p>}</section>
      {scenes.length ? <QuickScenes home={{ ...home, scenes }} /> : <p className="everyday-empty">Для этой комнаты нет доступных сценариев. <Link to="/scenes">Все сценарии</Link></p>}
    </div>;
  }}</HomeDataBoundary>;
}
