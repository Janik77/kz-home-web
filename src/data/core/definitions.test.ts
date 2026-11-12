import { expect, it, vi } from 'vitest';
import { createServices } from '../create-services';
import { coreResponses, coreScene } from '../../test/core-fixtures';
import { validName } from './definitions';

async function setup(options: { grants?: string[]; status?: number; foreign?: boolean; changed?: boolean; readbackFailure?: boolean } = {}) {
  const writes: unknown[] = []; let saved = { ...coreScene }; let wrote = false;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url).replace('/core-api', '');
    if (path.endsWith('/me/permissions')) return Response.json({ house_id: 'house-a', permissions: options.grants ?? ['scene.read', 'scene.manage', 'automation.read', 'automation.manage'] });
    if (path === '/scenes/scene-a' || path === '/automations/scene-a') {
      if (init?.method === 'PATCH') {
        writes.push(JSON.parse(String(init.body))); wrote = true;
        if (options.status) return new Response(null, { status: options.status });
        saved = { ...saved, ...JSON.parse(String(init.body)) };
      }
      if (wrote && options.readbackFailure) return new Response(null, { status: 503 });
      return Response.json({ ...saved, ...(options.foreign ? { house_id: 'foreign' } : {}), ...(!wrote && options.changed ? { name: 'Concurrent edit' } : {}) });
    }
    if (path === '/scenes' && init?.method === 'POST') {
      writes.push(JSON.parse(String(init.body))); saved = JSON.parse(String(init.body)); wrote = true;
      return Response.json(saved, { status: 201 });
    }
    return Response.json(coreResponses[path]);
  });
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher);
  if (services.mode !== 'core') throw Error();
  await services.session.login('a', 'b');
  return { definitions: services.repositoryForHouse('house-a').definitions!, writes, saved: () => saved, services, fetcher };
}
it.each(['scenes', 'automations'] as const)('renames %s with a minimal PATCH and verifies persistence', async kind => {
  const t = await setup();
  await t.definitions.rename(kind, 'scene-a', 'Evening', '  Вечер  ', new AbortController().signal);
  expect(t.writes).toEqual([{ name: 'Вечер' }]); expect(t.saved().actions).toEqual(coreScene.actions);
  expect(t.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/'+kind+'/scene-a'))).toHaveLength(3);
});
it.each([{ grants: [] }, { grants: ['scene.manage'] }, { foreign: true }, { changed: true }])('rejects unsafe preflight %j before write', async options => {
  const t = await setup(options);
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Новый', new AbortController().signal)).rejects.toBeDefined();
  expect(t.writes).toEqual([]);
});
it.each([401, 403, 422, 503])('never replays mutation after %i', async status => {
  const t = await setup({ status });
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Новый', new AbortController().signal)).rejects.toBeDefined();
  expect(t.writes).toHaveLength(1);
  if (status === 401) expect(t.services.session.getSnapshot().status).toBe('anonymous');
});
it('does not claim save success when readback fails', async () => {
  const t = await setup({ readbackFailure: true });
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Новый', new AbortController().signal)).rejects.toBeDefined();
  expect(t.writes).toHaveLength(1);
});
it('creates a scoped definition without execution endpoints', async () => {
  const t = await setup();
  await t.definitions.createScene({ id: 'scene-a', name: 'Новый', actions: [{ deviceId: 'lamp-a', on: false }] }, new AbortController().signal);
  expect(t.writes).toEqual([{ id: 'scene-a', house_id: 'house-a', name: 'Новый', actions: [{ type: 'device_state', device_id: 'lamp-a', state: { on: false } }] }]);
  expect(t.fetcher.mock.calls.some(([url]) => /run|enable|commands/.test(String(url)))).toBe(false);
});
it('rejects invalid and aborted drafts before any mutation', async () => {
  const t = await setup(); const controller = new AbortController(); controller.abort();
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Новый', controller.signal)).rejects.toBeDefined();
  for (const name of ['', '  ', 'x'.repeat(256)]) {
    expect(validName(name)).toBe(false);
    await expect(t.definitions.createScene({ id: 'scene-a', name, actions: [] }, new AbortController().signal)).rejects.toBeDefined();
  }
  expect(t.writes).toEqual([]);
});
