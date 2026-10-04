import { expect, it, vi } from 'vitest';
import { createServices } from './create-services';
import { coreResponses } from '../test/core-fixtures';

it('selects mock explicitly and keeps working commands without network', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const services = createServices({ mode: 'mock' }, fetcher);
  expect(services.mode).toBe('mock');
  if (services.mode !== 'mock') throw new Error('Expected mock');
  const home = await services.repository.getHome();
  const device = home.devices.find((device) => device.kind === 'light')!;
  expect(await services.repository.sendCommand({ type: 'set-power', deviceId: device.id, on: false })).toHaveProperty('house');
  expect(fetcher).not.toHaveBeenCalled();
});
it('selects Core, reads only verified routes, forwards cancellation and rejects all controls before HTTP', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const path = String(url).replace('/core-api', '');
    if (!(path in coreResponses)) throw new Error(`Unexpected test route ${path}`);
    return Response.json(coreResponses[path]);
  });
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher);
  if (services.mode !== 'core') throw new Error('Expected Core');
  await services.session.login('homeowner@example.test', 'test-input');
  const repository = services.repositoryForHouse('house-a');
  const controller = new AbortController();
  expect((await repository.getHome(controller.signal)).house.id).toBe('house-a');
  const calls = fetcher.mock.calls.length;
  await expect(repository.sendCommand({ type: 'set-power', deviceId: 'lamp-a', on: false })).rejects.toMatchObject({ kind: 'read-only' });
  await expect(repository.activateScene('scene-a')).rejects.toMatchObject({ kind: 'read-only' });
  expect(fetcher).toHaveBeenCalledTimes(calls);
  controller.abort(); expect(fetcher.mock.calls[2]?.[1]?.signal?.aborted).toBe(true);
});
