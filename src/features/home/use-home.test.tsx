import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { RepositoryProvider } from '../../app/services';
import { initialHome } from '../../data/mock/fixtures';
import { HomeDataBoundary } from './home-data-boundary';
import { isLiveHomePage, useHome } from './use-home';
import { useState } from 'react';

const clients: QueryClient[] = [];
afterEach(() => { clients.forEach(c => c.clear()); clients.length = 0; focusManager.setFocused(true); onlineManager.setOnline(true); vi.useRealTimers(); });
function setup() {
  vi.useFakeTimers();
  const getHome = vi.fn().mockResolvedValue(initialHome);
  const repository = { getHome, sendCommand: vi.fn(), activateScene: vi.fn() };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 } } });
  clients.push(client);
  function Draft() { const [value, setValue] = useState(''); return <input aria-label="draft" value={value} onChange={e => setValue(e.target.value)} />; }
  function Page({ live }: { live: boolean }) { useHome({ live }); return <HomeDataBoundary>{home => <><p>{home.house.name}</p><Draft /></>}</HomeDataBoundary>; }
  const view = (live: boolean) => <QueryClientProvider client={client}><RepositoryProvider value={repository}><Page live={live} /></RepositoryProvider></QueryClientProvider>;
  const rendered = render(view(true));
  return { getHome, rerender: (live: boolean) => rendered.rerender(view(live)) };
}
async function tick(ms = 10) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }

it('refreshes shared state once per interval, preserves drafts and stops off the live route', async () => {
  const { getHome, rerender } = setup(); await tick();
  expect(getHome).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'unsaved' } });
  getHome.mockResolvedValue({ ...initialHome, house: { ...initialHome.house, name: 'External update' } });
  await tick(5000);
  expect(getHome).toHaveBeenCalledTimes(2);
  expect(screen.getByText('External update')).toBeInTheDocument();
  expect(screen.getByLabelText('draft')).toHaveValue('unsaved');
  rerender(false); await tick(20000); expect(getHome).toHaveBeenCalledTimes(2);
});

it('pauses in the background/offline and refreshes on recovery', async () => {
  const { getHome } = setup(); await tick();
  act(() => focusManager.setFocused(false)); await tick(15000);
  expect(getHome).toHaveBeenCalledTimes(1);
  act(() => focusManager.setFocused(true)); await tick();
  expect(getHome).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(false)); await tick(15000);
  expect(getHome).toHaveBeenCalledTimes(2);
  act(() => onlineManager.setOnline(true)); await tick();
  expect(getHome).toHaveBeenCalledTimes(3);
});

it('backs off errors without unmounting drafts or claiming success, then recovers', async () => {
  const { getHome } = setup(); await tick();
  fireEvent.change(screen.getByLabelText('draft'), { target: { value: 'keep me' } });
  getHome.mockRejectedValue(new Error('offline'));
  await tick(5000);
  expect(screen.getByRole('alert')).toHaveTextContent('текущее не подтверждено');
  expect(screen.getByLabelText('draft')).toHaveValue('keep me');
  expect(getHome).toHaveBeenCalledTimes(2);
  await tick(20000); expect(getHome).toHaveBeenCalledTimes(2);
  getHome.mockResolvedValue(initialHome); await tick(10000);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('draft')).toHaveValue('keep me');
});

it('limits live subscription to Home and a device detail', () => {
  expect(isLiveHomePage('/')).toBe(true); expect(isLiveHomePage('/devices/relay')).toBe(true);
  for (const path of ['/devices', '/automations', '/scenes', '/settings', '/rooms']) expect(isLiveHomePage(path)).toBe(false);
});
