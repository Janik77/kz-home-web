import { Link, useParams } from 'react-router';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { PageHeading } from '../../components/ui/page-heading';
import { DeviceGrid } from './device-grid';
import { CoreControlNotice } from './core-control-notice';
import { useRepository } from '../../app/services';
export function DeviceDetailPage() {
 const { deviceId } = useParams(); const core = useRepository().readOnly;
 return <HomeDataBoundary household>{home => {
  const device = home.devices.find(d=>d.id===deviceId), room = home.rooms.find(r=>r.id===device?.roomId);
  if(!device) return <div className="everyday-page"><h1>Устройство недоступно</h1><Link className="text-link" to="/devices">Все устройства</Link></div>;
  return <div className="everyday-page device-detail-page"><Link className="everyday-back" to="/devices">← Все устройства</Link><PageHeading eyebrow={room?.name ?? home.house.name} title={device.name} description="Состояние и доступные действия" /><DeviceGrid devices={[device]} rooms={home.rooms} everyday />{room && <Link className="text-link" to={`/rooms/${room.id}`}>Открыть комнату: {room.name}</Link>}{core && <details className="settings-panel diagnostics"><summary>Диагностика и ограничения</summary><CoreControlNotice device={device} locale="ru" /><p>Идентификатор: {device.id}</p><p>Название и размещение пока доступны только для просмотра: сервер не предоставляет атомарную защиту конфликтующих изменений этих полей.</p></details>}</div>;
 }}</HomeDataBoundary>;
}
