import { RenameDefinition } from '../definitions/definition-forms';
import { useQuery } from '@tanstack/react-query';
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
  if (query.isPending) return <StatePanel kind="loading" title="Загружаем данные Core" />;
  if (query.isError) return <StatePanel kind="error" title="Данные недоступны" description={coreErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return <><div className="resource-toolbar"><span role="status">Получено: {new Date(query.dataUpdatedAt).toLocaleTimeString('ru-RU')} · обновление вручную</span><Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching ? 'Обновляем…' : 'Обновить'}</Button></div>{query.data.length ? children(query.data) : <StatePanel kind="empty" title="Нет доступных записей" description="Core возвращает только записи, доступные вашей учётной записи в выбранном доме." />}</>;
}
export function AutomationsPage() {
  const activity = useRepository().activity;
  return <div className="page"><PageHeading eyebrow="ПРАВИЛА ДОМА" title="Автоматизации" description="Условия и действия из Core. Просмотр не запускает и не изменяет правила." />
    <Resource<AutomationRule> name="automations" read={activity && (signal => activity.automations(signal))}>{rules => <div className="automation-grid">{rules.map(rule => <article className="settings-panel automation-card" key={rule.id}>
      <div className="resource-heading"><h2>{rule.name}</h2><span className="resource-badge">{rule.enabled ? 'Включена в Core' : 'Выключена в Core'}</span></div>
      <dl><dt>Когда</dt><dd>{rule.trigger}</dd><dt>При условиях</dt><dd>{rule.conditions.length ? <ul>{rule.conditions.map((c, i) => <li key={i}>{c}</li>)}</ul> : 'Без дополнительных условий'}</dd><dt>Выполнить</dt><dd><ol>{rule.actions.map((a, i) => <li key={i}>{a}</li>)}</ol></dd></dl>
      <p className="quiet-note">Статус правила не подтверждает выполнение устройств. Можно изменить название; условия, действия и включение сохраняются без изменений. Запуск из Web недоступен.</p>
      <RenameDefinition kind="automations" id={rule.id} name={rule.name} />
    </article>)}</div>}</Resource>
  </div>;
}
export function EventsPage() {
  const activity = useRepository().activity;
  return <div className="page"><PageHeading eyebrow="СОСТОЯНИЕ СИСТЕМЫ" title="Журнал событий" description="Последние 100 доступных событий выбранного дома. Время показано в часовом поясе браузера; технические коды сохранены как в Core." />
    <Resource<HomeEvent> name="events" read={activity && (signal => activity.events(signal))}>{events => <ol className="event-list">{events.map(event => <li key={event.id}><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString('ru-RU')}</time><div><strong>{event.type}</strong><p>{event.entityId ?? 'Событие дома'}</p></div></li>)}</ol>}</Resource>
  </div>;
}
