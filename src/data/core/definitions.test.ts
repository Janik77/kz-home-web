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
        saved = { ...saved, ...JSON.parse(String(init.body)), revision: saved.revision + 1 };
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
  await t.definitions.rename(kind, 'scene-a', 'Evening', '  Вечер  ', new AbortController().signal, 1);
  expect(t.writes).toEqual([{ name: 'Вечер', expected_revision: 1 }]); expect(t.saved().actions).toEqual(coreScene.actions);
  expect(t.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/'+kind+'/scene-a'))).toHaveLength(3);
});
it.each([{ grants: [] }, { grants: ['scene.manage'] }, { foreign: true }, { changed: true }])('rejects unsafe preflight %j before write', async options => {
  const t = await setup(options);
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Новый', new AbortController().signal, 1)).rejects.toBeDefined();
  expect(t.writes).toEqual([]);
});
it.each([401, 403, 409, 422, 503])('never replays mutation after %i', async status => {
  const t = await setup({ status });
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Новый', new AbortController().signal, 1)).rejects.toBeDefined();
  expect(t.writes).toHaveLength(1);
  if (status === 401) expect(t.services.session.getSnapshot().status).toBe('anonymous');
});
it('does not claim save success when readback fails', async () => {
  const t = await setup({ readbackFailure: true });
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Новый', new AbortController().signal, 1)).rejects.toBeDefined();
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

it.each(['scenes', 'automations'] as const)('two %s clients send their captured revision; exactly one wins', async kind => {
  let record = { ...coreScene }; const writes: { name: string; expected_revision: number }[] = [];
  let reads = 0; let release!: () => void;
  const bothRead = new Promise<void>(resolve => { release = resolve; });
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url).replace('/core-api', '');
    if (path.endsWith('/me/permissions')) return Response.json({ house_id: 'house-a', permissions: ['scene.read', 'scene.manage', 'automation.read', 'automation.manage'] });
    if (path === `/${kind}/scene-a`) {
      if (init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)); writes.push(body);
        if (body.expected_revision !== record.revision) return Response.json({ code: 'definition_revision_conflict' }, { status: 409 });
        record = { ...record, name: body.name, revision: record.revision + 1 };
      } else if (reads < 2) {
        const snapshot = { ...record }; if (++reads === 2) release(); await bothRead; return Response.json(snapshot);
      }
      return Response.json(record);
    }
    return Response.json(coreResponses[path]);
  });
  const clients = [createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher), createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher)];
  const editors = await Promise.all(clients.map(async service => {
    if (service.mode !== 'core') throw Error(); await service.session.login('a', 'b'); return service.repositoryForHouse('house-a').definitions!;
  }));
  const outcomes = await Promise.allSettled(editors.map((editor, i) => editor.rename(kind, 'scene-a', 'Evening', `Client ${i}`, new AbortController().signal, 1)));
  expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
  expect(outcomes.filter(o => o.status === 'rejected')).toHaveLength(1);
  expect(writes).toHaveLength(2); expect(writes.every(w => w.expected_revision === 1)).toBe(true);
  expect(record.revision).toBe(2); expect(record.actions).toEqual(coreScene.actions);
});

it.each([undefined, null, true, '1', 1.5, 0, -1])('does not write with missing/invalid captured revision %s', async revision => {
  const t = await setup();
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Draft', new AbortController().signal, revision as number)).rejects.toBeDefined();
  expect(t.writes).toEqual([]);
});

it.each([undefined, 3])('rejects missing server revision or ABA version before PATCH (%s)', async revision => {
  const t = await setup(); const original = t.fetcher.getMockImplementation()!;
  t.fetcher.mockImplementation(async (url, init) => {
    if (String(url).endsWith('/scenes/scene-a') && init?.method === 'GET') return Response.json({ ...coreScene, revision });
    return original(url, init);
  });
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Draft', new AbortController().signal, 1)).rejects.toBeDefined();
  expect(t.writes).toEqual([]);
});

it.each([undefined, 1])('does not confirm a PATCH response without incremented revision (%s)', async revision => {
  const t = await setup(); const original = t.fetcher.getMockImplementation()!;
  t.fetcher.mockImplementation(async (url, init) => {
    const response = await original(url, init);
    if (init?.method === 'PATCH') return Response.json({ ...t.saved(), revision });
    return response;
  });
  await expect(t.definitions.rename('scenes', 'scene-a', 'Evening', 'Draft', new AbortController().signal, 1)).rejects.toBeDefined();
  expect(t.writes).toHaveLength(1);
});
