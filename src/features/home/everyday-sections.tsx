import { ArrowUpRight, ChevronRight, DoorOpen, Layers, Moon, Sofa, Sunrise, Wifi, WifiOff, RefreshCw, UserRound, Activity } from 'lucide-react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { HomeSnapshot } from '../../domain/home';
import { getRoomSummary } from '../../domain/selectors';
import { useRepository } from '../../app/services';
import { useHome, useHomeControls } from './use-home';
import { Button } from '../../components/ui/button';
import { sceneFeedback } from '../scenes/scene-result';

export function EverydayHeader({ home, title, subtitle }: { home: HomeSnapshot; title: string; subtitle: string }) {
  const query = useHome(); const demo = !useRepository().readOnly;
  return <header className="everyday-heading"><div><p className="everyday-eyebrow">{subtitle}</p><h1>{title}</h1><p className="everyday-connection"><Wifi size={16} aria-hidden="true" />{demo ? 'Виртуальный дом' : 'Данные дома получены'}{!demo && <span> · обновление вручную</span>}</p></div><div className="everyday-heading__actions">
    {!demo && <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={17} aria-hidden="true" />{query.isFetching ? 'Обновляем…' : 'Обновить данные'}</Button>}
    <Link className="everyday-profile" to="/settings" aria-label="Аккаунт и дома"><UserRound size={20} aria-hidden="true" /><span>{home.house.name}</span></Link>
  </div></header>;
}
export function SectionTitle({ title, to, link = 'Все' }: { title: string; to?: string; link?: string }) {
  return <div className="everyday-section-title"><h2>{title}</h2>{to && <Link to={to}>{link}<ArrowUpRight size={16} aria-hidden="true" /></Link>}</div>;
}
const sceneIcons = { sunrise: Sunrise, sofa: Sofa, moon: Moon, away: DoorOpen, scene: Layers };
export function QuickScenes({ home }: { home: HomeSnapshot }) {
  const { readOnly, scene, pending } = useHomeControls();
  if (!home.scenes.length) return null;
  return <section className="everyday-scenes" aria-label="Быстрые сценарии"><SectionTitle title="Быстрые сценарии" to="/scenes" link="Все сценарии" /><div className="everyday-scene-list">{home.scenes.slice(0, 4).map(item => {
    const Icon = sceneIcons[item.icon];
    return readOnly ? <Link key={item.id} to="/scenes" className="everyday-scene"><Icon size={21} aria-hidden="true" /><span>{item.name}<small>Открыть действия</small></span><ChevronRight size={16} aria-hidden="true" /></Link> : <Button key={item.id} variant="secondary" className="everyday-scene" aria-label={`Запустить ${item.name}`} disabled={pending} onClick={() => scene.mutate(item.id)}><Icon size={21} aria-hidden="true" /><span>{item.name}<small>{scene.isPending && scene.variables === item.id ? 'Выполняем…' : 'Симуляция'}</small></span></Button>;
  })}</div>{scene.isSuccess && <p role="status" className="everyday-inline-note">{sceneFeedback(home.scenes.find(s => s.id === scene.variables)?.name ?? 'Сценарий', scene.data).message} Только симуляция.</p>}{scene.isError && <p role="alert">Не удалось выполнить сценарий. Проверьте устройства.</p>}</section>;
}
export function EverydayRooms({ home }: { home: HomeSnapshot }) {
  return <section className="everyday-rooms"><SectionTitle title="Комнаты" to="/rooms" link="Все комнаты" />{home.rooms.length ? <div className="everyday-room-list">{home.rooms.map(room => {
    const summary = getRoomSummary(home.devices.filter(d => d.roomId === room.id));
    return <Link className="everyday-room" key={room.id} to={`/rooms/${room.id}`}><span className="everyday-room__icon"><DoorOpen size={22} aria-hidden="true" /></span><span><strong>{room.name}</strong><small>Устройств: {summary.total}{summary.offline ? ` · нет связи: ${summary.offline}` : summary.active ? ` · активно: ${summary.active}` : ''}</small></span>{summary.temperature !== null && <b>{summary.temperature.toFixed(1)}°</b>}<ChevronRight size={17} aria-hidden="true" /></Link>;
  })}</div> : <p className="everyday-empty">Комнат пока нет.</p>}</section>;
}
export function RecentEvents({ home }: { home: HomeSnapshot }) {
  const repository = useRepository();
  const query = useQuery({ queryKey: ['activity', 'events'], queryFn: ({ signal }) => repository.activity!.events(signal), enabled: !!repository.activity, retry: false });
  // Raw event types/IDs remain in the journal. Only explicit supported labels belong here.
  const labels: Record<string, string> = { device_offline: 'Устройство потеряло связь', device_online: 'Связь восстановлена', automation_failed: 'Правило не выполнено' };
  const rows = (query.data ?? []).filter(e => labels[e.type] || (!repository.readOnly && e.type.startsWith('Пример:'))).slice(0, 3);
  return <section className="everyday-events"><SectionTitle title="Недавние события" to="/events" link="Журнал" />{query.isError ? <p className="everyday-empty" role="alert">Не удалось загрузить события. <Button variant="quiet" onClick={() => void query.refetch()}>Повторить</Button></p> : query.isPending && repository.activity ? <p role="status" className="everyday-empty">Загружаем события…</p> : rows.length ? <ol>{rows.map(e => <li key={e.id}><Activity size={17} aria-hidden="true" /><div><p>{labels[e.type] ?? e.type.replace('Пример: ', '')}</p>{home.devices.find(d => d.id === e.entityId) && <small>{home.devices.find(d => d.id === e.entityId)!.name}</small>}<time dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div></li>)}</ol> : <p className="everyday-empty">{query.data?.length ? 'Другие события доступны в журнале.' : 'Нет доступных важных событий.'}</p>}</section>;
}
export function RoomConnection({ online, total }: { online: number; total: number }) {
  const Icon = online < total ? WifiOff : Wifi;
  return <span><Icon size={17} aria-hidden="true" />{online < total ? `Нет связи: ${total - online}` : `${online} из ${total} в сети`}</span>;
}
