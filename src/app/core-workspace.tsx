import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from './app';
import { RepositoryProvider } from './services';
import { RuntimeContext } from './runtime-context';
import type { createServices } from '../data/create-services';
import { readHouses } from '../data/core/core-home-repository';
import { coreErrorMessage } from '../data/core/errors';
import { LoginPage } from '../features/auth/login-page';
import { StatePanel } from '../components/ui/state-panel';
import { Button } from '../components/ui/button';
import type { AccessibleHouse, SessionUser } from '../domain/session';

type Services = Extract<ReturnType<typeof createServices>, { mode: 'core' }>;

export function CoreWorkspace({ services }: { services: Services }) {
  const snapshot = useSyncExternalStore(services.session.subscribe, services.session.getSnapshot);
  const client = useQueryClient();
  useEffect(() => { if (snapshot.status !== 'authenticated') { void client.cancelQueries(); client.clear(); } }, [snapshot.status, client]);
  if (snapshot.status === 'signing-out') return <main className="app-shell--everyday session-page"><StatePanel kind="loading" title="Завершаем сеанс" description="Удаляем данные сеанса из памяти." /></main>;
  if (!snapshot.user) return <LoginPage session={services.session} snapshot={snapshot} />;
  return <HouseWorkspace key={snapshot.user.id} services={services} user={snapshot.user} />;
}

function HouseWorkspace({ services, user }: { services: Services; user: SessionUser }) {
  const [selected, setSelected] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useQuery({ queryKey: ['core-houses', user.id], queryFn: ({ signal }) => readHouses(services.session, signal), retry: false });
  const houseId = query.data?.some((house) => house.id === selected) ? selected : query.data?.length === 1 ? query.data[0]!.id : null;
  useEffect(() => { if (!houseId) { document.title = 'KZ Home · Ваши дома'; heading.current?.focus(); } }, [houseId]);
  const logout = () => { void services.session.logout(); };
  if (query.data && houseId && !query.isError) return <SelectedHome key={houseId} services={services} user={user} houses={query.data} houseId={houseId} selectHouse={setSelected} logout={logout} />;
  return <main className="app-shell--everyday session-page"><div className="session-card">
    <p className="eyebrow">ВАШЕ ПРОСТРАНСТВО</p><h1 ref={heading} tabIndex={-1}>Ваши дома</h1>
    {query.isPending ? <StatePanel kind="loading" title="Ищем ваши дома" description="Проверяем доступные вашей учётной записи дома." />
      : query.isError ? <StatePanel kind="error" title="Не удалось загрузить дома" description={coreErrorMessage(query.error)} onRetry={() => void query.refetch()} />
      : query.data.length === 0 ? <StatePanel kind="empty" title="Нет доступных домов" description="Попросите владельца дома предоставить доступ. Создание домов и управление участниками пока недоступны в Web." onRetry={() => void query.refetch()} />
      : <><p>Выберите дом, чтобы посмотреть его комнаты и устройства.</p><div className="house-options">{query.data.map((house) => <Button variant="secondary" key={house.id} onClick={() => setSelected(house.id)}>{house.name}</Button>)}</div></>}
    <Button variant="quiet" onClick={logout}>Выйти</Button>
  </div></main>;
}

function SelectedHome({ services, user, houses, houseId, selectHouse, logout }: {
  services: Services; user: SessionUser; houses: AccessibleHouse[]; houseId: string;
  selectHouse: (id: string | null) => void; logout: () => void;
}) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } }));
  const [repository] = useState(() => services.repositoryForHouse(houseId));
  useEffect(() => () => { void client.cancelQueries(); client.clear(); }, [client]);
  return <QueryClientProvider client={client}><RepositoryProvider value={repository}>
    <RuntimeContext value={{ mode: 'core', user, houses, houseId, selectHouse, logout }}><App /></RuntimeContext>
  </RepositoryProvider></QueryClientProvider>;
}
