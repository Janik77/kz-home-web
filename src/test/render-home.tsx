import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach } from 'vitest';
import { RepositoryProvider } from '../app/services';
import type { HomeRepository } from '../data/home-repository';
import type { HomeSnapshot } from '../domain/home';
import { HomeDataBoundary } from '../features/home/home-data-boundary';

const clients: QueryClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.clear(); });

export function renderHome(repository: HomeRepository, children: (home: HomeSnapshot) => ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  return render(<MemoryRouter><QueryClientProvider client={client}><RepositoryProvider value={repository}>
    <HomeDataBoundary>{children}</HomeDataBoundary>
  </RepositoryProvider></QueryClientProvider></MemoryRouter>);
}
