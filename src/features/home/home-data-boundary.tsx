import type { ReactNode } from 'react';
import type { HomeSnapshot } from '../../domain/home';
import { StatePanel } from '../../components/ui/state-panel';
import { useHome } from './use-home';
import { CoreError, coreErrorMessage } from '../../data/core/errors';

export function HomeDataBoundary({ children, locale = 'ru', household = false }: { household?: boolean; children: (home: HomeSnapshot) => ReactNode; locale?: 'en' | 'ru' }) {
  const query = useHome();
  // A failed background read must not unmount controls/editors or erase drafts.
  // Access revocation still fails closed; cached data is never presented as fresh.
  if (query.isError && query.data && !(query.error instanceof CoreError && ['unauthorized', 'forbidden', 'not-found'].includes(query.error.kind))) {
    return <><p role="alert" className="quiet-note">Не удалось обновить данные. Показано последнее известное состояние, текущее не подтверждено.</p>{children(query.data)}</>;
  }
  if (locale === 'ru') {
    if (query.isPending) return <StatePanel kind="loading" title="Готовим ваш дом" description="Загружаем комнаты и устройства." />;
    if (query.isError) {
      const restricted = query.error instanceof CoreError && query.error.kind === 'forbidden';
      const unavailable = query.error instanceof CoreError && ['network', 'server'].includes(query.error.kind);
      return <StatePanel kind={restricted ? 'restricted' : 'error'} title={restricted ? 'Доступ ограничен' : unavailable ? (household ? 'Нет связи с домом' : 'Core недоступен') : 'Не удалось загрузить дом'} description={restricted ? 'У этой учётной записи нет доступа к данным дома.' : 'Проверьте соединение и повторите загрузку. Состояние устройств не подтверждено.'} retryLabel="Повторить" onRetry={() => void query.refetch()} />;
    }
    return <><span />{children(query.data)}</>;
  }
  if (query.isPending) return <StatePanel kind="loading" title="Готовим ваш дом" description="Bringing your rooms and devices together." />;
  if (query.isError) {
    const restricted = query.error instanceof CoreError && query.error.kind === 'forbidden';
    const unavailable = query.error instanceof CoreError && ['network', 'server'].includes(query.error.kind);
    return <StatePanel kind={restricted ? 'restricted' : 'error'} title={restricted ? 'Доступ ограничен' : unavailable ? (household ? 'Нет связи с домом' : 'Core недоступен') : 'Не удалось загрузить дом'} description={coreErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return <><span />{children(query.data)}</>;
}
