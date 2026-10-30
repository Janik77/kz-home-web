import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { renderHome } from '../../test/render-home';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { initialHome } from '../../data/mock/fixtures';
import type { Receipt, RelayControl } from '../../data/core/relay-control';
import { ConfirmedRelayControl } from './confirmed-relay-control';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { homeKey } from '../home/use-home';

const device = { id: 'relay', roomId: 'room', name: 'Relay', kind: 'relay' as const, on: false, favorite: false, connection: 'online' as const };
const receipt: Receipt = { command_id: 'cmd', correlation_id: 'corr', house_id: initialHome.house.id, device_id: device.id,
  requested_on: true, status: 'applied', expires_at: new Date().toISOString(), failure_code: null };
it.each([false, true])('preserves observed state until applied and separates refresh failure (%s)', async fails => {
  const base = createMockHomeRepository({ ...initialHome, devices: [device] }, 0);
  let finish!: (r: Receipt) => void;
  let update!: (r: Receipt) => void;
  const run = vi.fn<RelayControl['run']>((_id, _on, callback) => { update = callback; return new Promise(resolve => { finish = resolve; }); });
  const getHome = vi.fn(base.getHome);
  renderHome({ ...base, getHome, relayControl: { eligible: async () => [device.id], run } }, home => <>
    <p>Observed: {String(home.devices[0]!.kind === 'relay' && home.devices[0]!.on)}</p><ConfirmedRelayControl device={device} />
  </>);
  const button = await screen.findByRole('button', { name: 'Включить' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button); fireEvent.click(button);
  expect(run).toHaveBeenCalledTimes(1); expect(screen.getByRole('status')).toHaveTextContent('Отправляем команду');
  act(() => update({ ...receipt, status: 'dispatched' }));
  expect(screen.getByRole('status')).toHaveTextContent('Ожидаем подтверждение');
  expect(screen.getByText('Observed: false')).toBeInTheDocument();
  if (fails) getHome.mockRejectedValueOnce(new Error('network'));
  else getHome.mockResolvedValueOnce({ ...initialHome, devices: [{ ...device, on: true }] });
  await act(async () => finish(receipt));
  expect(screen.getByRole('status')).toHaveTextContent(fails ? 'Выполнено · состояние не обновлено' : 'Выполнено · данные Core обновлены');
  await waitFor(() => expect(screen.getByText(`Observed: ${String(!fails)}`)).toBeInTheDocument());
});

it('does not let an older device refresh overwrite a newer confirmed snapshot', async () => {
  let client!: QueryClient;
  function Probe() { client = useQueryClient(); return null; }
  const second = { ...device, id: 'second' };
  const original = { ...initialHome, devices: [device, second] };
  const base = createMockHomeRepository(original, 0);
  let old!: (value: typeof original) => void;
  let fresh!: (value: typeof original) => void;
  const getHome = vi.fn(base.getHome)
    .mockResolvedValueOnce(original)
    .mockImplementationOnce(() => new Promise(resolve => { old = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { fresh = resolve; }));
  renderHome({ ...base, getHome, relayControl: { eligible: async () => ['relay', 'second'], run: async id => ({ ...receipt, device_id: id }) } }, home => <>
    <Probe />
    <p>Observed: {home.devices.map(d => d.kind === 'relay' ? String(d.on) : '').join(',')}</p>
    <section aria-label="first"><ConfirmedRelayControl device={device} /></section>
    <section aria-label="second"><ConfirmedRelayControl device={second} /></section>
  </>);
  const first = within(await screen.findByRole('region', { name: 'first' })).getByRole('button', { name: 'Включить' });
  await waitFor(() => expect(first).toBeEnabled()); fireEvent.click(first);
  await waitFor(() => expect(old).toBeTypeOf('function'));
  fireEvent.click(within(screen.getByRole('region', { name: 'second' })).getByRole('button', { name: 'Включить' }));
  await waitFor(() => expect(fresh).toBeTypeOf('function'));
  await act(async () => fresh({ ...original, devices: [{ ...device, on: true }, { ...second, on: true }] }));
  await waitFor(() => expect(screen.getByText('Observed: true,true')).toBeVisible());
  await act(async () => old({ ...original, devices: [{ ...device, on: true }, second] }));
  expect(client.getQueryData<typeof original>(homeKey)?.devices[1]).toMatchObject({ on: true });
  await waitFor(() => expect(screen.getByText('Observed: true,true')).toBeVisible());
});
it('aborts on unmount and ignores a late result even when the adapter ignores cancellation', async () => {
  const base = createMockHomeRepository(initialHome, 0);
  let finish!: (r: Receipt) => void; let signal!: AbortSignal;
  const getHome = vi.fn(base.getHome);
  const view = renderHome({ ...base, getHome, relayControl: { eligible: async () => [device.id],
    run: (_id, _on, _update, incoming) => { signal = incoming; return new Promise(resolve => { finish = resolve; }); },
  } }, () => <ConfirmedRelayControl device={device} />);
  const button = await screen.findByRole('button', { name: 'Включить' }); await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button); view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => finish(receipt)); expect(getHome).toHaveBeenCalledTimes(1);
});
