import type { ReactNode } from 'react';
import type { HomeSnapshot } from '../../domain/home';
import { StatePanel } from '../../components/ui/state-panel';
import { useHome } from './use-home';
import { CoreError, coreErrorMessage } from '../../data/core/errors';

export function HomeDataBoundary({ children, locale = 'en' }: { children: (home: HomeSnapshot) => ReactNode; locale?: 'en' | 'ru' }) {
  const query = useHome();
  if (locale === 'ru') {
    if (query.isPending) return <StatePanel kind="loading" title="Готовим ваш дом" description="Загружаем комнаты и устройства." />;
    if (query.isError) {
      const restricted = query.error instanceof CoreError && query.error.kind === 'forbidden';
      const unavailable = query.error instanceof CoreError && ['network', 'server'].includes(query.error.kind);
      return <StatePanel kind={restricted ? 'restricted' : 'error'} title={restricted ? 'Доступ ограничен' : unavailable ? 'Core недоступен' : 'Не удалось загрузить дом'} description={restricted ? 'У этой учётной записи нет доступа к данным дома.' : 'Проверьте соединение и повторите загрузку. Состояние устройств не подтверждено.'} retryLabel="Повторить" onRetry={() => void query.refetch()} />;
    }
    return children(query.data);
  }
  if (query.isPending) return <StatePanel kind="loading" title="Getting your home ready" description="Bringing your rooms and devices together." />;
  if (query.isError) {
    const restricted = query.error instanceof CoreError && query.error.kind === 'forbidden';
    const unavailable = query.error instanceof CoreError && ['network', 'server'].includes(query.error.kind);
    return <StatePanel kind={restricted ? 'restricted' : 'error'} title={restricted ? 'Access is limited' : unavailable ? 'Core is unavailable' : 'We couldn’t load your home'} description={coreErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  return children(query.data);
}
