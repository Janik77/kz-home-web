import type { ReactNode } from 'react';
import type { HomeSnapshot } from '../../domain/home';
import { StatePanel } from '../../components/ui/state-panel';
import { useHome } from './use-home';
import { coreErrorMessage } from '../../data/core/errors';

export function HomeDataBoundary({ children }: { children: (home: HomeSnapshot) => ReactNode }) {
  const query = useHome();
  if (query.isPending) return <StatePanel kind="loading" title="Getting your home ready" description="Bringing your rooms and devices together." />;
  if (query.isError) return <StatePanel kind="error" title="We couldn’t load your home" description={coreErrorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return children(query.data);
}
