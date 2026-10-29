import { expect, it, vi } from 'vitest';
import { createServices } from '../create-services';
import { coreDevice, coreResponses } from '../../test/core-fixtures';
import type { DeviceCommand } from '../../domain/home';

it('rejects repeated real mutations before HTTP, independent of auth or device capability', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher);
  if (services.mode !== 'core') throw new Error('Expected Core');
  const repository = services.repositoryForHouse('house-a');
  const commands: DeviceCommand[] = [
    { type: 'set-power', deviceId: 'relay-a', on: true },
    { type: 'set-power', deviceId: 'relay-a', on: false },
    { type: 'set-brightness', deviceId: 'lamp-a', brightness: 50 },
    { type: 'set-position', deviceId: 'curtain-a', position: 100 },
  ];
  expect(repository.readOnly).toBe(true);
  await Promise.all([...commands, ...commands].map((command) => expect(repository.sendCommand(command)).rejects.toMatchObject({ kind: 'read-only' })));
  await expect(repository.activateScene('scene-a')).rejects.toMatchObject({ kind: 'read-only' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('reads only observed relay state, never treating additive ACK-like fields as confirmation', async () => {
  let on = false;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const path = String(url).replace('/core-api', '');
    return Response.json(path.startsWith('/devices?') ? [{ ...coreDevice, type: 'relay', capabilities: ['on_off'], state: { on }, command_id: 'untrusted-extra', status: 'applied' }] : coreResponses[path]);
  });
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher);
  if (services.mode !== 'core') throw new Error('Expected Core');
  await services.session.login('homeowner@example.test', 'test-input');
  const repository = services.repositoryForHouse('house-a');
  expect((await repository.getHome()).devices[0]).toMatchObject({ kind: 'relay', on: false, connection: 'online' });
  const calls = fetcher.mock.calls.length;
  await expect(repository.sendCommand({ type: 'set-power', deviceId: coreDevice.id, on: true })).rejects.toMatchObject({ kind: 'read-only' });
  expect(fetcher).toHaveBeenCalledTimes(calls);
  on = true;
  const refreshed = (await repository.getHome()).devices[0];
  expect(refreshed).toMatchObject({ kind: 'relay', on: true });
  expect(refreshed).not.toHaveProperty('command_id');
  expect(refreshed).not.toHaveProperty('status');
  expect(fetcher.mock.calls.filter(([, options]) => options?.method !== 'GET').map(([url]) => url)).toEqual(['/core-api/auth/login']);
});
