import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CoreWorkspace } from './core-workspace';
import { ThemeProvider } from './theme-provider';
import { createServices } from '../data/create-services';
import { coreDevice, coreFloor, coreHouse, coreResponses, coreRoom } from '../test/core-fixtures';
import { StrictMode } from 'react';

const clients: QueryClient[] = [];
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });

function setup(fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => Response.json(coreResponses[String(url).replace('/core-api', '')]))) {
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher);
  if (services.mode !== 'core') throw new Error('Core required');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  render(<StrictMode><ThemeProvider><QueryClientProvider client={client}><CoreWorkspace services={services} /></QueryClientProvider></ThemeProvider></StrictMode>);
  return { services, fetcher };
}

async function signIn() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'homeowner@example.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-input' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
}

it('renders login pending, then a read-only home in StrictMode with no real control buttons', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
    .mockImplementation(async (url) => Response.json(coreResponses[String(url).replace('/core-api', '')]));
  setup(fetcher); await signIn();
  expect(screen.getByRole('button', { name: 'Signing in…' })).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByLabelText('Password')).toHaveValue('');
  finish(Response.json(coreResponses['/auth/login']));
  expect(await screen.findByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeVisible();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Activate Evening' })).not.toBeInTheDocument();
  expect(document.querySelector('img')).toBeNull();
});

it('shows invalid credentials and Core network failures without server detail', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ detail: 'private-input' }, { status: 401 }));
  setup(fetcher); await signIn();
  expect(await screen.findByText('The email or password wasn’t accepted. Please try again.')).toBeVisible();
  fetcher.mockRejectedValueOnce(new TypeError('private-network-info')); await signIn();
  expect(await screen.findByText(/We couldn’t reach Core/)).toBeVisible();
  expect(screen.queryByText(/private-input|private-network-info/)).not.toBeInTheDocument();
});

it('shows no accessible houses with a retry rather than a sample home', async () => {
  setup(vi.fn<typeof fetch>().mockImplementation(async (url) => Response.json(String(url).endsWith('/houses') ? [] : coreResponses[String(url).replace('/core-api', '')])));
  await signIn();
  expect(await screen.findByRole('heading', { name: 'No accessible homes' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeNull();
});

it('reports permission failures without substituting empty data', async () => {
  setup(vi.fn<typeof fetch>().mockImplementation(async (url) => String(url).includes('/devices?') ? new Response(null, { status: 403 }) : Response.json(coreResponses[String(url).replace('/core-api', '')])));
  await signIn();
  expect(await screen.findByText('У этой учётной записи нет доступа к данным дома.')).toBeVisible();
});

it('returns to session-expired login when refresh is rejected and removes house data', async () => {
  const { services, fetcher } = setup(); await signIn();
  await screen.findByRole('heading', { name: 'Добро пожаловать домой', level: 1 });
  fetcher.mockImplementation(async (url) => String(url).endsWith('/auth/refresh') || String(url).endsWith('/houses/house-a')
    ? new Response(null, { status: 401 }) : Response.json(coreResponses[String(url).replace('/core-api', '')]));
  fireEvent.click(screen.getByRole('button', { name: 'Обновить данные' }));
  expect(await screen.findByText('Your session has expired. Sign in again to continue.')).toBeVisible();
  await waitFor(() => expect(services.session.getSnapshot().status).toBe('anonymous'));
  expect(screen.queryByRole('heading', { name: 'Добро пожаловать домой', level: 1 })).toBeNull();
});

it('aborts a previous house read and ignores its late state after switching homes', async () => {
  let delayOldHouse = false;
  let finishOld!: (response: Response) => void;
  let oldSignal: AbortSignal | null | undefined;
  const responses: Record<string, unknown> = {
    ...coreResponses,
    '/houses': [coreHouse, { ...coreHouse, id: 'house-b', name: 'Second home' }],
    '/houses/house-b': { ...coreHouse, id: 'house-b', name: 'Second home' },
    '/floors': [coreFloor, { ...coreFloor, id: 'floor-b', house_id: 'house-b' }],
    '/rooms': [coreRoom, { ...coreRoom, id: 'room-b', floor_id: 'floor-b', name: 'Second room' }],
    '/devices?house_id=house-b': [{ ...coreDevice, id: 'relay-b', room_id: 'room-b', name: 'Second relay', type: 'relay', capabilities: ['on_off'], state: { on: false } }],
  };
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url, options) => {
    const path = String(url).replace('/core-api', '');
    if (path === '/devices?house_id=house-a' && delayOldHouse) {
      oldSignal = options?.signal;
      // Deliberately ignore abort to prove even a misbehaving late response cannot leak.
      return new Promise((resolve) => { finishOld = resolve; });
    }
    return Response.json(responses[path]);
  });
  setup(fetcher); await signIn();
  fireEvent.click(await screen.findByRole('button', { name: 'Family home' }));
  await screen.findByRole('article', { name: 'Reading light · Living room' });
  delayOldHouse = true;
  fireEvent.click(screen.getByRole('button', { name: 'Обновить данные' }));
  await waitFor(() => expect(finishOld).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('link', { name: 'Аккаунт и дома' }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Home' }), { target: { value: 'house-b' } });
  expect(await screen.findByRole('article', { name: 'Second relay · Second room' })).toHaveTextContent('Выключено');
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => { finishOld(Response.json([{ ...coreDevice, name: 'Late old state', state: { on: true, brightness: 100 } }])); });
  expect(screen.queryByText('Late old state')).toBeNull();
  expect(screen.getByRole('article', { name: 'Second relay · Second room' })).toHaveTextContent('Выключено');
  expect(screen.queryByRole('switch')).toBeNull();
  expect(fetcher.mock.calls.filter(([, options]) => options?.method !== 'GET').map(([url]) => url)).toEqual(['/core-api/auth/login']);
});
