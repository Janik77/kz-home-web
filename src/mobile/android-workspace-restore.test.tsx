import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreSession } from '../data/core/session';
import { coreUser, tokenPair } from '../test/core-fixtures';
import { AndroidWorkspace } from './android-workspace';

type NativeStateListener = (s: { isActive: boolean }) => void;

const fixture = vi.hoisted(() => ({
  foreground: new Set<NativeStateListener>(),
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
    getStatus: async () => ({ connected: true, connectionType: 'wifi' }),
    addListener: async () => ({ remove: async () => undefined }),
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

  it('foreground retries failed anonymous health before a single refresh, even in StrictMode', async () => {
    fixture.fetcher.mockResolvedValueOnce(Response.json({ status: 'starting' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ status: 'ok' }))
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
      [origin + '/health', 'GET'], [origin + '/health', 'GET'],
      [origin + '/auth/refresh', 'POST'], [origin + '/auth/me', 'GET'],
    ]);
    expect(fixture.take).toHaveBeenCalledTimes(1);
  });

  it('an address change prevents late consumption after an in-flight probe', async () => {
    let health!: (reply: Response) => void;
    fixture.fetcher.mockImplementationOnce(() => new Promise(resolve => { health = resolve; }));
    render(<StrictMode><AndroidWorkspace /></StrictMode>);
    await waitFor(() => expect(requests()).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Сменить адрес' }));
    await screen.findByRole('heading', { name: 'Подключить дом' });
    await act(async () => health(Response.json({ status: 'ok' })));
    expect(fixture.take).not.toHaveBeenCalled();
    expect(requests()).toEqual([[origin + '/health', 'GET']]);
  });
});
