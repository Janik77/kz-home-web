import { useState } from 'react';
import { useHome } from '../home/use-home';
import { eventLabel } from './activity-copy';
import { RenameDefinition } from '../definitions/definition-forms';
import { useQuery } from '@tanstack/react-query';
import { useRuntime } from '../../app/runtime-context';
import { useRepository } from '../../app/services';
import { PageHeading } from '../../components/ui/page-heading';
import { StatePanel } from '../../components/ui/state-panel';
import { Button } from '../../components/ui/button';
import { coreErrorMessage } from '../../data/core/errors';
import type { AutomationRule, HomeEvent } from '../../domain/activity';
import type { ReactNode } from 'react';

function Resource<T>({ name, read, children }: { name: string; read: ((signal: AbortSignal) => Promise<T[]>) | undefined; children: (data: T[]) => ReactNode }) {
  const query = useQuery({ queryKey: ['activity', name], queryFn: ({ signal }) => read!(signal), enabled: !!read, retry: false });
  if (!read) return <StatePanel kind="empty" title="Доступно при подключении к Core" description="В демо-режиме нет настоящих правил и событий. Подключение настраивается в локальной конфигурации Web." />;
  if (query.isPending) return <StatePanel kind="loading" title="Загружаем данные дома" />;
  if (query.isError) return <StatePanel kind="error" title="Данные недоступны" description={coreErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return <><div className="resource-toolbar"><span role="status">Получено: {new Date(query.dataUpdatedAt).toLocaleTimeString('ru-RU')} · обновление вручную</span><Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Обновляем…' : 'Обновить'}</Button></div>{query.data.length ? children(query.data) : <StatePanel kind="empty" title="Нет доступных записей" description="Core возвращает только записи, доступные вашей учётной записи в выбранном доме." />}</>;
}
export function AutomationsPage() {
  const activity = useRepository().activity;
  const demo = useRuntime().mode === 'mock';
  return <div className="page everyday-page"><PageHeading eyebrow="ПРАВИЛА ДОМА" title="Автоматизации" description={demo ? 'Примеры правил для виртуального дома. Автоматически не выполняются.' : 'Что происходит в доме по заданным условиям. Просмотр не запускает правила.'} />
    <Resource<AutomationRule> name="automations" read={activity && (signal => activity.automations(signal))}>{rules => <div className="automation-grid">{rules.map(rule => <article className="settings-panel automation-card" key={rule.id}>
      <div className="resource-heading"><h2>{rule.name}</h2><span className="resource-badge">{demo ? 'Отключена' : rule.enabled ? 'Включена' : 'Выключена'}</span></div>
      <dl><dt>Когда</dt><dd>{rule.trigger}</dd><dt>При условиях</dt><dd>{rule.conditions.length ? <ul>{rule.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul> : 'Без дополнительных условий'}</dd><dt>Выполнить</dt><dd><ol>{rule.actions.map((a, i) => <li key={i}>{a}</li>)}</ol></dd></dl>
      <details className="diagnostics"><summary>О работе правила</summary><p className="quiet-note">{demo ? 'Это пример правила. Оно не выполняется и не сохраняется в Core.' : 'Статус правила не подтверждает выполнение устройств. Можно изменить название; условия, действия и включение сохраняются без изменений. Запуск из Web недоступен.'}</p></details>
      <RenameDefinition kind="automations" id={rule.id} name={rule.name} revision={rule.revision} />
    </article>)}</div>}</Resource>
  </div>;
}
export function EventsPage() {
  const activity = useRepository().activity;
  const demo = useRuntime().mode === 'mock';
  const home = useHome(); const [search,setSearch]=useState('');
  const entityName=(id:string|null)=>home.data?.devices.find(d=>d.id===id)?.name ?? home.data?.scenes.find(s=>s.id===id)?.name ?? 'Событие дома';
  return <div className="page everyday-page"><PageHeading eyebrow="ИСТОРИЯ ДОМА" title="Журнал событий" description={demo ? 'Примеры событий, а не история настоящего дома.' : 'Последние события вашего дома. Время показано в вашем часовом поясе.'} />
    <label className="journal-search">Найти в загруженных событиях<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Событие или устройство" /></label>
    {!demo && <p className="quiet-note">Показаны последние 100 доступных записей, это не полная история команд. Начало сценария и ответ устройства сами по себе не подтверждают выполнение.</p>}
    <Resource<HomeEvent> name="events" read={activity && (signal => activity.events(signal))}>{events => <ol className="event-list">{events.filter(event=>`${eventLabel(event.type)} ${entityName(event.entityId)}`.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU'))).map(event => <li key={event.id}><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('ru-RU')}</time><div><strong>{eventLabel(event.type)}</strong><p>{entityName(event.entityId)}</p><details className="diagnostics"><summary>Технические сведения</summary><p>{event.type} · {event.entityId ?? '—'}</p></details></div></li>)}</ol>}</Resource>
  </div>;
}
