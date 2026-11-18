import { expect, it, vi } from 'vitest';
import { createServices } from '../create-services';
import { coreResponses } from '../../test/core-fixtures';
import { decodeMetadata, type MetadataKind } from './metadata';
async function setup({ grants = ['house.read', 'house.manage', 'device.manage'], failure = 0, revision = 3, foreign = false, mismatch = false } = {}) {
  const rows: Record<string, Record<string, unknown>> = {
    '/houses/house-a': { id: 'house-a', name: 'Дом', metadata_revision: revision },
    '/floors/floor-a': { id: 'floor-a', name: 'Этаж', house_id: 'house-a', metadata_revision: revision },
    '/floors/floor-b': { id: 'floor-b', name: 'Второй', house_id: foreign ? 'foreign' : 'house-a', metadata_revision: revision },
    '/rooms/room-a': { id: 'room-a', name: 'Комната', floor_id: 'floor-a', metadata_revision: revision },
    '/rooms/room-b': { id: 'room-b', name: 'Другая', floor_id: 'floor-b', metadata_revision: revision },
    '/devices/device-a': { id: 'device-a', name: 'Свет', room_id: 'room-a', metadata_revision: revision },
  };
  const writes: unknown[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url).replace('/core-api', '');
    if (path.endsWith('/me/permissions')) return Response.json({ house_id: 'house-a', permissions: grants });
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body)); writes.push(body);
      if (failure) return new Response(null, { status: failure });
      rows[path] = { ...rows[path], ...body, metadata_revision: revision + (mismatch ? 0 : 1) };
    }
    return Response.json(rows[path] ?? coreResponses[path]);
  });
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher); if (services.mode !== 'core') throw Error();
  await services.session.login('a', 'b');
  return { api: services.repositoryForHouse('house-a').metadata!, writes, rows, fetcher };
}
const signal = () => new AbortController().signal;
it.each(['house', 'floor', 'room', 'device'] as MetadataKind[])('CAS rename and verified readback for %s, no commands/timezone writes', async kind => {
  const t = await setup(), base = await t.api.read(kind, `${kind}-a`, signal());
  const saved = await t.api.save(base, { name: ' Новое ', parentId: base.parentId }, signal());
  expect(saved.name).toBe('Новое'); expect(saved.revision).toBe(4);
  expect(t.writes).toEqual([{ name: 'Новое', expected_metadata_revision: 3, ...(kind === 'room' ? { floor_id: 'floor-a' } : kind === 'device' ? { room_id: 'room-a' } : {}) }]);
  expect(t.fetcher.mock.calls.some(([u]) => /commands|execute|timezone/.test(String(u)))).toBe(false);
});
it.each(['room', 'device'] as const)('moves %s only to a verified current-house parent', async kind => {
  const t = await setup(), base = await t.api.read(kind, `${kind}-a`, signal());
  expect((await t.api.save(base, { name: base.name, parentId: kind === 'room' ? 'floor-b' : 'room-b' }, signal())).parentId).toMatch(/-b$/);
});
it.each(['room', 'device'] as const)('rejects foreign %s parent before writing', async kind => {
  const t = await setup({ foreign: true }), base = await t.api.read(kind, `${kind}-a`, signal());
  await expect(t.api.save(base, { name: 'Новое', parentId: kind === 'room' ? 'floor-b' : 'room-b' }, signal())).rejects.toMatchObject({ kind: 'forbidden' }); expect(t.writes).toEqual([]);
});
it.each([403, 409, 422, 503])('never replays PATCH after %i', async failure => {
  const t = await setup({ failure }), base = await t.api.read('house', 'house-a', signal());
  await expect(t.api.save(base, { name: 'Новое', parentId: null }, signal())).rejects.toBeDefined(); expect(t.writes).toHaveLength(1);
});
it('blocks stale base before PATCH', async () => {
  const t = await setup(), base = await t.api.read('room', 'room-a', signal()); t.rows['/rooms/room-a']!.metadata_revision = 4;
  await expect(t.api.save(base, { name: 'Новое', parentId: base.parentId }, signal())).rejects.toMatchObject({ kind: 'conflict' }); expect(t.writes).toEqual([]);
});
it('requires fresh relevant permission', async () => {
  const t = await setup({ grants: ['house.read', 'house.manage'] }), base = await t.api.read('device', 'device-a', signal());
  await expect(t.api.save(base, { name: 'Новое', parentId: base.parentId }, signal())).rejects.toMatchObject({ kind: 'forbidden' }); expect(t.writes).toEqual([]);
});
it('rejects nonincrementing write response', async () => { const t = await setup({ mismatch: true }), base = await t.api.read('house', 'house-a', signal()); await expect(t.api.save(base, { name: 'Новое', parentId: null }, signal())).rejects.toMatchObject({ kind: 'protocol' }); });
it('older Core is read-only, malformed counters rejected', () => {
  expect(decodeMetadata('house', { id: 'h', name: 'Home' }).revision).toBeNull();
  for (const revision of [null, 0, -1, true, '1', 1.5]) expect(() => decodeMetadata('house', { id: 'h', name: 'Home', metadata_revision: revision })).toThrow();
});
