import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RepositoryProvider } from '../../app/services';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { initialHome } from '../../data/mock/fixtures';
import { HomeDataBoundary } from './home-data-boundary';
import { CoreError } from '../../data/core/errors';

describe('home data boundary', () => {
  it.each([
    ['forbidden', 'Access is limited'],
    ['network', 'Core is unavailable'],
    ['server', 'Core is unavailable'],
  ] as const)('distinguishes %s from individual device connectivity', async (kind, heading) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const repository = { ...createMockHomeRepository(initialHome, 0), getHome: vi.fn().mockRejectedValue(new CoreError(kind)) };
    render(<QueryClientProvider client={client}><RepositoryProvider value={repository}>
      <HomeDataBoundary>{() => <h1>Stale device controls</h1>}</HomeDataBoundary>
    </RepositoryProvider></QueryClientProvider>);
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Stale device controls' })).not.toBeInTheDocument();
    client.clear();
  });
  it('shows loading, a recoverable failure, then data after retry', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const getHome = vi.fn().mockRejectedValueOnce(new Error('Connection unavailable')).mockResolvedValue(initialHome);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><RepositoryProvider value={{ ...repository, getHome }}>
      <HomeDataBoundary>{(home) => <h1>{home.house.name}</h1>}</HomeDataBoundary>
    </RepositoryProvider></QueryClientProvider>);
    expect(screen.getByRole('status')).toHaveTextContent('Getting your home ready');
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t load your home');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Family home' })).toBeInTheDocument();
    expect(getHome).toHaveBeenCalledTimes(2);
    client.clear();
  });
});
