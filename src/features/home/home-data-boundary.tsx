import type { ReactNode } from 'react';
import type { HomeSnapshot } from '../../domain/home';
import { StatePanel } from '../../components/ui/state-panel';
import { useHome } from './use-home';

export function HomeDataBoundary({ children }: { children: (home: HomeSnapshot) => ReactNode }) {
  const query = useHome();
  if (query.isPending) return <StatePanel kind="loading" title="Getting your home ready" description="Bringing your rooms and devices together." />;
  if (query.isError) return <StatePanel kind="error" title="We couldn’t load your home" description="Please try again in a moment." onRetry={() => void query.refetch()} />;
  return children(query.data);
}
