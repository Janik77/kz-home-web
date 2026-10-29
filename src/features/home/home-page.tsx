import { useState } from 'react';
import { ArrowUpRight, Blinds, ChevronRight, DoorOpen, Layers, Lightbulb, Moon, Plug, Radio, ShieldCheck, Sofa, Sunrise, Thermometer, Wifi } from 'lucide-react';
import { Link } from 'react-router';
import type { Device, DeviceCommand, HomeSnapshot } from '../../domain/home';
import { getHomeSummary, isActive } from '../../domain/selectors';
import { InteriorPhoto } from '../../components/ui/interior-photo';
import { Switch } from '../../components/ui/switch';
import { RangeControl } from '../../components/ui/range-control';
import { Feedback } from '../../components/ui/feedback';
import { Button } from '../../components/ui/button';
import { HomeDataBoundary } from './home-data-boundary';
import { useHome, useHomeControls } from './use-home';
import { countRu, displayName, stateRu } from './signature-copy';

const sceneIcons = { sofa: Sofa, away: DoorOpen, moon: Moon, sunrise: Sunrise, scene: Layers };
const sceneOrder = ['sofa', 'away', 'moon', 'sunrise', 'scene'];
const deviceIcons = { light: Lightbulb, relay: Plug, curtain: Blinds, sensor: Thermometer, other: Radio };

function FavoriteDevice({ device, room, readOnly, busy, operation, revision, send, retry }: {
  device: Device; room: string; readOnly: boolean; busy: boolean; operation: string; revision: string;
  send: (command: DeviceCommand) => void; retry: () => void;
}) {
  const name = displayName(device.name, readOnly);
  const offline = device.connection === 'offline';
  const Icon = deviceIcons[device.kind];
  return <article id={`device-${device.id}`} tabIndex={-1} aria-label={`${name} · ${room}`} className={`signature-device ${isActive(device) ? 'signature-device--active' : ''} ${offline ? 'signature-device--offline' : ''}`}>
    <div className="signature-device__top"><Icon size={22} aria-hidden="true" /><div><h3>{name}</h3><p>{room}</p></div>
      {!readOnly && (device.kind === 'light' || device.kind === 'relay') && <Switch label={`${name} · ${room}`} checked={device.on} disabled={offline} busy={busy} onChange={(on) => send({ type: 'set-power', deviceId: device.id, on })} />}
    </div>
    <p className="signature-device__state">{offline && 'Не в сети · последнее: '}{stateRu(device)}</p>
    {!readOnly && !offline && device.kind === 'light' && device.brightness !== null && <RangeControl label="Яркость" accessibleLabel={`Яркость: ${name} · ${room}`} value={device.brightness} disabled={busy} revision={revision} onCommit={(brightness) => send({ type: 'set-brightness', deviceId: device.id, brightness })} />}
    {!readOnly && !offline && device.kind === 'curtain' && <div className="signature-curtain"><Button variant="quiet" aria-label={`Закрыть: ${name}`} aria-disabled={busy} onClick={() => { if (!busy) send({ type: 'set-position', deviceId: device.id, position: 0 }); }}>Закрыть</Button><Button variant="quiet" aria-label={`Открыть: ${name}`} aria-disabled={busy} onClick={() => { if (!busy) send({ type: 'set-position', deviceId: device.id, position: 100 }); }}>Открыть</Button></div>}
    <p className="signature-device__source">{readOnly ? `${offline ? 'Core сообщает: не в сети' : 'Данные Core'} · только просмотр` : 'Симуляция · не физическое устройство'}</p>
    {!readOnly && operation === 'pending' && <Feedback tone="pending" message="Обновляем симуляцию…" />}
    {!readOnly && operation === 'success' && <Feedback tone="success" message="Симуляция обновлена." />}
    {!readOnly && operation === 'error' && <Feedback tone="error" message="Не удалось обновить симуляцию. Показано последнее состояние."><Button variant="quiet" aria-disabled={busy || offline} onClick={() => { if (!busy && !offline) retry(); }}>Повторить</Button></Feedback>}
  </article>;
}

function SignatureHome({ home }: { home: HomeSnapshot }) {
  const { command, scene, pending, readOnly } = useHomeControls();
  const query = useHome();
  const [today] = useState(() => new Date());
  const summary = getHomeSummary(home);
  const cover = home.rooms.find((room) => room.image);
  const scenes = [...home.scenes].sort((a, b) => sceneOrder.indexOf(a.icon) - sceneOrder.indexOf(b.icon)).slice(0, 4);
  const devices = readOnly ? home.devices : home.devices.filter((device) => device.favorite);
  const offline = home.devices.filter((device) => device.connection === 'offline');
  const selectedScene = home.scenes.find((item) => item.id === scene.variables);
  const sceneName = selectedScene ? displayName(selectedScene.name, readOnly) : '';
  return <div className="signature-home" lang="ru">
    <header className={`signature-hero ${cover ? '' : 'signature-hero--plain'}`}>
      {cover && <InteriorPhoto src={cover.image} position={cover.imagePosition} eager className="signature-hero__photo" />}
      <div className="signature-hero__content"><p className="signature-date">{new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(today)}<span className="signature-mode-label">{readOnly ? 'Core · только просмотр' : 'Демо · симуляция'}</span></p><h1>Добро пожаловать домой</h1><p className="signature-hero__subtitle">{displayName(home.house.name, readOnly)} · всё важное перед вами</p>
        <div className="signature-status" aria-label="Состояние дома">
          <div><Thermometer size={21} aria-hidden="true" /><span><strong>{summary.temperature === null ? 'Нет измерений' : `${summary.temperature.toFixed(1)} °C`}</strong><small>{readOnly ? 'По данным Core · среднее' : 'Пример температуры'}</small></span></div>
          <div className="signature-status__mode"><ShieldCheck size={21} aria-hidden="true" /><span><strong>{readOnly ? 'Только просмотр' : 'Симуляция'}</strong><small>{readOnly ? 'Без команд устройствам' : 'Без реального оборудования'}</small></span></div>
          <div><Wifi size={21} aria-hidden="true" /><span><strong>{summary.online} из {summary.total} в сети</strong><small>{readOnly ? 'По данным Core' : 'Демо-устройства'}</small></span></div>
        </div>
        {readOnly && <div className="signature-core-tools"><Button variant="quiet" aria-disabled={query.isFetching} onClick={() => { if (!query.isFetching) void query.refetch(); }}>{query.isFetching ? 'Обновляем…' : 'Обновить данные'}</Button><Link to="/settings" className="text-link">Аккаунт и дома</Link></div>}
      </div>
    </header>
    <section className="signature-quick" aria-labelledby="scenes-title"><div className="signature-heading"><h2 id="scenes-title">Быстрые сценарии</h2><Link to="/scenes">Все сценарии <ArrowUpRight size={14} aria-hidden="true" /></Link></div>
      <div className="signature-scene-grid">{scenes.map((item) => {
        const Icon = sceneIcons[item.icon];
        const name = displayName(item.name, readOnly);
        const content = <><span className={`signature-scene__icon signature-scene__icon--${item.icon}`}><Icon size={24} aria-hidden="true" /></span><span><strong>{name}</strong><small>{readOnly ? 'Только просмотр' : `${item.actions.length} действий · симуляция`}</small></span></>;
        return <article className="signature-scene" key={item.id} aria-label={name}>{readOnly ? <Link to="/scenes">{content}</Link> : <button type="button" aria-label={`Запустить сценарий: ${name}`} aria-disabled={pending} onClick={() => { if (!pending) scene.mutate(item.id); }}>{content}</button>}</article>;
      })}</div>
      {!scenes.length && <p className="signature-empty">Сценариев пока нет. Они появятся здесь после добавления в дом.</p>}
      {scene.isPending && <Feedback tone="pending" message={`Симулируем: ${sceneName}…`} />}
      {scene.isSuccess && <Feedback tone={scene.data.skipped ? 'warning' : 'success'} message={`Симуляция «${sceneName}»: обновлено ${scene.data.applied}, пропущено ${scene.data.skipped}. Не подтверждение оборудования.`} />}
      {scene.isError && <Feedback tone="error" message="Сценарий не выполнен. Последнее состояние сохранено." />}
    </section>
    <section className="signature-rooms" aria-labelledby="rooms-title"><div className="signature-heading"><h2 id="rooms-title">Комнаты</h2><Link to="/rooms">Все комнаты <ArrowUpRight size={14} aria-hidden="true" /></Link></div><div className="signature-room-grid">{home.rooms.map((room) => <Link key={room.id} className="signature-room" to={`/rooms/${room.id}`} aria-label={`Открыть комнату: ${displayName(room.name, readOnly)}`}>
      <InteriorPhoto src={room.image} position={room.imagePosition} /><div className="signature-room__caption"><div><h3>{displayName(room.name, readOnly)}</h3><p>{countRu(home.devices.filter((device) => device.roomId === room.id).length, ['устройство', 'устройства', 'устройств'])}</p></div><ChevronRight size={18} aria-hidden="true" /></div>
    </Link>)}</div>{!home.rooms.length && <p className="signature-empty">Комнат пока нет.</p>}</section>
    <section className="signature-favorites" aria-labelledby="favorites-title"><div className="signature-heading"><h2 id="favorites-title">{readOnly ? 'Устройства' : 'Избранные устройства'}</h2><span>{readOnly ? 'Управление недоступно' : 'Симуляция'}</span></div><div className="signature-device-grid">{devices.map((device) => <FavoriteDevice key={device.id} device={device} room={displayName(home.rooms.find((room) => room.id === device.roomId)?.name ?? 'Без комнаты', readOnly)} readOnly={readOnly} busy={pending}
      operation={command.variables?.deviceId === device.id ? command.status : 'idle'} revision={`${command.submittedAt}:${command.status}:${scene.submittedAt}:${scene.status}`} send={(input) => { if (!pending) command.mutate(input); }} retry={() => { if (command.variables && !pending) command.mutate(command.variables); }} />)}</div>{!devices.length && <p className="signature-empty">Устройств пока нет.</p>}</section>
    <section className="signature-system" aria-label="Система и доступность"><div><ShieldCheck size={17} aria-hidden="true" /><p>{readOnly ? 'Состояние сообщено Core · время актуальности неизвестно' : 'Демонстрационный дом · изменения сбрасываются при перезагрузке'}</p></div>{offline.length > 0 && <details><summary>Не в сети: {countRu(offline.length, ['устройство', 'устройства', 'устройств'])}</summary><ul>{offline.map((device) => <li key={device.id}><Link to={`/rooms/${device.roomId}#device-${device.id}`}>{displayName(device.name, readOnly)} · {displayName(home.rooms.find((room) => room.id === device.roomId)?.name ?? 'Без комнаты', readOnly)}</Link></li>)}</ul></details>}</section>
  </div>;
}

export function HomePage() {
  return <HomeDataBoundary locale="ru">{(home) => <SignatureHome home={home} />}</HomeDataBoundary>;
}
