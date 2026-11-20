import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreSession } from '../data/core/session';
import { coreUser, tokenPair } from '../test/core-fixtures';
import { AndroidWorkspace } from './android-workspace';
import { mobileReadRefresh } from './read-refresh';

type NativeStateListener = (s: { isActive: boolean }) => void;
type NativeNetworkStatus = { connected: boolean; connectionType: 'wifi' | 'none' };

const fixture = vi.hoisted(() => ({
  foreground: new Set<NativeStateListener>(),
  networks: new Set<(status: NativeNetworkStatus) => void>(),
  nativeStatus: vi.fn<() => Promise<NativeNetworkStatus>>(),
  fetcher: vi.fn<typeof fetch>(),
  saved: vi.fn<() => Promise<{ origin: string } | null>>(),
  take: vi.fn<() => Promise<string | null>>(),
  clear: vi.fn<() => Promise<void>>(),
  save: vi.fn<(s: string) => Promise<void>>(),
  forget: vi.fn<() => Promise<void>>(),
  remember: vi.fn<() => Promise<void>>(),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: async (name: string, listener: NativeStateListener) => {
      if (name === 'appStateChange') fixture.foreground.add(listener);
      return { remove: async () => { fixture.foreground.delete(listener); } };
    },
  },
}));
vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: fixture.nativeStatus,
    addListener: async (_name: string, listener: (s: NativeNetworkStatus) => void) => {
      fixture.networks.add(listener);
      return { remove: async () => { fixture.networks.delete(listener); } };
    },
  },
}));
vi.mock('./store', () => ({
  rememberedHome: fixture.saved,
  nativeRefreshVault: () => ({ take: fixture.take, save: fixture.save, clear: fixture.clear }),
  forgetEndpoint: fixture.forget,
  rememberHome: fixture.remember,
}));
vi.mock('./transport', () => ({ nativeCoreFetcher: () => fixture.fetcher }));
vi.mock('../components/ui/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('../app/core-workspace', async () => {
  const { useSyncExternalStore } = await import('react');
  return { CoreWorkspace: ({ services, mobile }: {
    services: { session: Pick<CoreSession, 'getSnapshot' | 'subscribe'> };
    mobile: { onChangeConnection: () => Promise<void> };
  }) => {
    const session = useSyncExternalStore(services.session.subscribe, services.session.getSnapshot);
    return <><p>{session.status}</p><button onClick={() => void mobile.onChangeConnection()}>Сменить адрес</button></>;
  } };
});

const origin = 'https://192.168.21.2:8443';
const wifi: NativeNetworkStatus = { connected: true, connectionType: 'wifi' };
const requests = () => fixture.fetcher.mock.calls.map(([url, request]) => [url, request?.method]);

async function resumeApp() {
  await act(async () => {
    fixture.foreground.forEach(listener => listener({ isActive: false }));
    fixture.foreground.forEach(listener => listener({ isActive: true }));
  });
}

describe('Android workspace starts only the appropriate vault restore', () => {
  beforeEach(() => {
    fixture.foreground.clear();
    fixture.networks.clear();
    fixture.nativeStatus.mockReset().mockResolvedValue(wifi);
    fixture.fetcher.mockReset();
    fixture.saved.mockReset().mockResolvedValue({ origin });
    fixture.take.mockReset().mockResolvedValue('synthetic-refresh');
    fixture.clear.mockReset().mockResolvedValue(undefined);
    fixture.save.mockReset().mockResolvedValue(undefined);
    fixture.forget.mockReset().mockResolvedValue(undefined);
    fixture.remember.mockReset().mockResolvedValue(undefined);
  });

  it('fresh onboarding does not introduce a second GET or vault resume', async () => {
    fixture.saved.mockResolvedValue(null);
    fixture.fetcher.mockResolvedValueOnce(Response.json({ status: 'ok' }));
    render(<StrictMode><AndroidWorkspace /></StrictMode>);
    fireEvent.change(await screen.findByLabelText('Адрес Core'), { target: { value: origin } });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }));
    await screen.findByText('anonymous');
    await resumeApp();
    expect(requests()).toEqual([[origin + '/health', 'GET']]);
    expect(fixture.take).not.toHaveBeenCalled();
  });

  it('foreground retries failed anonymous readiness before a single refresh, even in StrictMode', async () => {
    fixture.fetcher.mockResolvedValueOnce(Response.json({ status: 'not_ready', reason: 'database_unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: 'ready' }))
      .mockResolvedValueOnce(Response.json(tokenPair))
      .mockResolvedValueOnce(Response.json(coreUser));
    render(<StrictMode><AndroidWorkspace /></StrictMode>);
    await waitFor(() => expect(requests()).toHaveLength(1));
    await screen.findByText('anonymous');
    expect(fixture.take).not.toHaveBeenCalled();
    await resumeApp();
    await screen.findByText('authenticated');
    await resumeApp();
    expect(requests()).toEqual([
      [origin + '/ready', 'GET'], [origin + '/ready', 'GET'],
      [origin + '/auth/refresh', 'POST'], [origin + '/auth/me', 'GET'],
    ]);
    expect(fixture.take).toHaveBeenCalledTimes(1);
  });

  it('keeps the foreground intent when Android reports unchanged Wi-Fi ahead of getStatus', async () => {
    fixture.fetcher.mockResolvedValueOnce(Response.json({ status: 'not_ready', reason: 'database_unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: 'ready' }))
      .mockResolvedValueOnce(Response.json(tokenPair))
      .mockResolvedValueOnce(Response.json(coreUser));
    render(<StrictMode><AndroidWorkspace /></StrictMode>);
    await waitFor(() => expect(requests()).toHaveLength(1));
    await act(async () => { /* Settle the unsuccessful anonymous GET. */ });
    expect(fixture.take).not.toHaveBeenCalled();

    let delayedStatus!: (status: NativeNetworkStatus) => void;
    fixture.nativeStatus.mockImplementationOnce(() => new Promise(resolve => { delayedStatus = resolve; }));
    const readRefresh = vi.fn();
    window.addEventListener(mobileReadRefresh, readRefresh);
    try {
      await act(async () => {
        fixture.foreground.forEach(listener => listener({ isActive: false }));
        fixture.foreground.forEach(listener => listener({ isActive: true }));
        fixture.networks.forEach(listener => listener(wifi));
        delayedStatus(wifi);
      });
      await screen.findByText('authenticated');
      expect(readRefresh).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(mobileReadRefresh, readRefresh);
    }
    expect(requests()).toEqual([
      [origin + '/ready', 'GET'], [origin + '/ready', 'GET'],
      [origin + '/auth/refresh', 'POST'], [origin + '/auth/me', 'GET'],
    ]);
    expect(fixture.take).toHaveBeenCalledTimes(1);
  });

  it('does not probe on a stale online reply after a newer disconnect', async () => {
    fixture.fetcher.mockResolvedValueOnce(Response.json({ status: 'not_ready', reason: 'database_unavailable' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: 'ready' }))
      .mockResolvedValueOnce(Response.json(tokenPair))
      .mockResolvedValueOnce(Response.json(coreUser));
    render(<StrictMode><AndroidWorkspace /></StrictMode>);
    await waitFor(() => expect(requests()).toHaveLength(1));
    await act(async () => { /* Settle the unsuccessful GET. */ });
    let delayedStatus!: (status: NativeNetworkStatus) => void;
    fixture.nativeStatus.mockImplementationOnce(() => new Promise(resolve => { delayedStatus = resolve; }));
    await act(async () => {
      fixture.foreground.forEach(listener => listener({ isActive: false }));
      fixture.foreground.forEach(listener => listener({ isActive: true }));
      fixture.networks.forEach(listener => listener({ connected: false, connectionType: 'none' }));
      delayedStatus(wifi);
    });
    expect(requests()).toEqual([[origin + '/ready', 'GET']]);
    expect(fixture.take).not.toHaveBeenCalled();
    await act(async () => fixture.networks.forEach(listener => listener(wifi)));
    await screen.findByText('authenticated');
    expect(fixture.take).toHaveBeenCalledTimes(1);
    expect(requests().filter(([url]) => url === origin + '/ready')).toHaveLength(2);
  });

  it('an address change prevents late consumption after an in-flight probe', async () => {
    let probe!: (reply: Response) => void;
    fixture.fetcher.mockImplementationOnce(() => new Promise(resolve => { probe = resolve; }));
    render(<StrictMode><AndroidWorkspace /></StrictMode>);
    await waitFor(() => expect(requests()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Сменить адрес' }));
    await screen.findByRole('heading', { name: 'Подключить дом' });
    await act(async () => probe(Response.json({ status: 'ready' })));
    expect(fixture.take).not.toHaveBeenCalled();
    expect(requests()).toEqual([[origin + '/ready', 'GET']]);
  });
});
