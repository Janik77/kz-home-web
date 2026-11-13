import { useState } from 'react';
import { ArrowUpRight, ShieldCheck, Thermometer, Wifi } from 'lucide-react';
import { Link } from 'react-router';
import type { HomeSnapshot } from '../../domain/home';
import { getHomeSummary } from '../../domain/selectors';
import { InteriorPhoto } from '../../components/ui/interior-photo';
import { Button } from '../../components/ui/button';
import { HomeDataBoundary } from './home-data-boundary';
import { useHome, useHomeControls } from './use-home';
import { countRu, displayName } from './signature-copy';
import { DeviceGrid } from '../devices/device-grid';
import { RoomGrid } from '../rooms/room-grid';
import { SceneControls } from '../scenes/scene-controls';

function SignatureHome({ home }: { home: HomeSnapshot }) {
  const { readOnly } = useHomeControls();
  const query = useHome();
  const [today] = useState(() => new Date());
  const summary = getHomeSummary(home);
  const cover = home.rooms.find((room) => room.image);
  const scenes = home.scenes.slice(0, 4);
  const devices = readOnly ? home.devices : home.devices.filter((device) => device.favorite);
  const offline = home.devices.filter((device) => device.connection === 'offline');
  return <div className="signature-home" lang="ru">
    <header className={`signature-hero ${cover ? '' : 'signature-hero--plain'}`}>
      {cover && <InteriorPhoto src={cover.image} position={cover.imagePosition} eager className="signature-hero__photo" />}
      <div className="signature-hero__content"><p className="signature-date">{new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(today)}</p><h1>Добро пожаловать домой</h1><p className="signature-hero__subtitle">{displayName(home.house.name, readOnly)} · всё важное перед вами</p>
        <div className="signature-status" aria-label="Состояние дома">
          <div><Thermometer size={21} aria-hidden="true" /><span><strong>{summary.temperature === null ? 'Нет измерений' : `${summary.temperature.toFixed(1)} °C`}</strong><small>Средняя температура</small></span></div>

          <div><Wifi size={21} aria-hidden="true" /><span><strong>{summary.online} из {summary.total} в сети</strong><small>Устройства</small></span></div>
        </div>
        {readOnly && <div className="signature-core-tools"><Button variant="quiet" aria-disabled={query.isFetching} onClick={() => { if (!query.isFetching) void query.refetch(); }}>{query.isFetching ? 'Обновляем…' : 'Обновить данные'}</Button><Link to="/settings" className="text-link">Аккаунт и дома</Link></div>}
      </div>
    </header>
    <section className="signature-favorites" aria-labelledby="favorites-title"><div className="signature-heading"><h2 id="favorites-title">{readOnly ? 'Устройства' : 'Избранные устройства'}</h2><Link to="/devices">Все устройства <ArrowUpRight size={14} aria-hidden="true" /></Link></div>{devices.length ? <DeviceGrid devices={devices} rooms={home.rooms} /> : <p className="signature-empty">Устройств пока нет.</p>}</section>
    <section className="signature-quick" aria-labelledby="scenes-title"><div className="signature-heading"><h2 id="scenes-title">Быстрые сценарии</h2><Link to="/scenes">Все сценарии <ArrowUpRight size={14} aria-hidden="true" /></Link></div><SceneControls home={{ ...home, scenes }} /></section>
    <section className="signature-rooms" aria-labelledby="rooms-title"><div className="signature-heading"><h2 id="rooms-title">Комнаты</h2><Link to="/rooms">Все комнаты <ArrowUpRight size={14} aria-hidden="true" /></Link></div>{home.rooms.length ? <RoomGrid home={home} /> : <p className="signature-empty">Комнат пока нет.</p>}</section>
    <section className="signature-system" aria-label="Система и доступность"><div><ShieldCheck size={17} aria-hidden="true" /><p>{readOnly ? 'Состояние сообщено Core · время актуальности неизвестно' : 'Доступность устройств'}</p></div>{offline.length > 0 && <details><summary>Не в сети: {countRu(offline.length, ['устройство', 'устройства', 'устройств'])}</summary><ul>{offline.map((device) => <li key={device.id}><Link to={`/rooms/${device.roomId}#device-${device.id}`}>{displayName(device.name, readOnly)} · {displayName(home.rooms.find((room) => room.id === device.roomId)?.name ?? 'Без комнаты', readOnly)}</Link></li>)}</ul></details>}</section>
  </div>;
}

export function HomePage() {
  return <HomeDataBoundary locale="ru">{(home) => <SignatureHome home={home} />}</HomeDataBoundary>;
}
