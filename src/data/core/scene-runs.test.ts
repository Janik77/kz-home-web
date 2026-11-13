import { expect, it, vi } from 'vitest';
import { checkRun, createSceneRuns, decodeSceneRun } from './scene-runs';
import { CoreSession } from './session';
import { HttpClient } from './http-client';
import { coreUser, tokenPair } from '../../test/core-fixtures';
const ready = () => ({ id: 'run', house_id: 'house-a', scene_id: 'scene', scene_revision: 3,
  created_at: '2026-11-13T00:00:00Z', dispatch_deadline: '2026-11-13T00:05:00Z', status: 'ready',
  actions: [{ position: 0, device_id: 'relay', requested_on: true, status: 'ready', failure_code: null, receipt: null as unknown }] });
const receipt = () => ({ command_id: 'command', correlation_id: 'correlation', house_id: 'house-a', device_id: 'relay', requested_on: true, status: 'applied', expires_at: '2026-11-13T00:00:30Z', failure_code: null });
it('rejects HTTP success without applied evidence, foreign receipt and malformed positions', () => {
  for (const change of [ { status: 'succeeded' }, { actions: [] }, { actions: [{ ...ready().actions[0], position: 1 }] },
    { actions: [{ ...ready().actions[0], status: 'applied' }] },
    { actions: [{ ...ready().actions[0], status: 'applied', receipt: { ...receipt(), house_id: 'foreign' } }] } ]) {
    expect(() => decodeSceneRun({ ...ready(), ...change })).toThrow();
  }
});
it.each(['ready', 'running', 'stopped', 'unknown', 'expired'])('preserves aggregate %s without inventing success', status => {
  expect(decodeSceneRun({ ...ready(), status }).status).toBe(status);
});
it('rejects immutable snapshot, receipt correlation and deadline substitution', () => {
  const before = decodeSceneRun({ ...ready(), status: 'succeeded', actions: [{ ...ready().actions[0], status: 'applied', receipt: receipt() }] });
  for (const after of [{ ...before, scene_revision: 4 }, { ...before, dispatch_deadline: '2026-11-13T00:06:00Z' },
    { ...before, actions: [{ ...before.actions[0]!, receipt: { ...receipt(), correlation_id: 'different', status: 'applied' as const } }] }]) {
    expect(() => checkRun(before, after)).toThrow();
  }
});
async function harness() {
  let result = ready(), code = 201, grants = ['scene.read', 'scene.run', 'device.read', 'device.control'];
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    if (String(url).endsWith('/auth/login')) return Response.json(tokenPair);
    if (String(url).endsWith('/auth/me')) return Response.json(coreUser);
    if (String(url).endsWith('/permissions')) return Response.json({ house_id: 'house-a', permissions: grants });
    return Response.json(result, { status: options?.method === 'POST' ? code : 200 });
  });
  const session = new CoreSession(new HttpClient('/core-api', fetcher)); await session.login('test@example.test', 'test');
  return { service: createSceneRuns(session, 'house-a'), fetcher, set: (r: typeof result, c = 201) => { result = r; code = c; }, deny: () => { grants = ['scene.read']; },
    posts: () => fetcher.mock.calls.filter(([url, o]) => String(url).includes('scene-runs') && o?.method === 'POST') };
}
it('sends exact revision and stable explicit retry key; never automatically retries a 409', async () => {
  const h = await harness(), signal = new AbortController().signal;
  h.set(ready(), 409); await expect(h.service.create('scene', 3, 'same-intent-key-123', signal)).rejects.toMatchObject({ kind: 'conflict' });
  expect(h.posts()).toHaveLength(1); h.set(ready()); await h.service.create('scene', 3, 'same-intent-key-123', signal);
  expect(h.posts()).toHaveLength(2);
  for (const [, o] of h.posts()) { expect(JSON.parse(String(o!.body))).toEqual({ scene_id: 'scene', expected_revision: 3 }); expect(new Headers(o!.headers).get('Idempotency-Key')).toBe('same-intent-key-123'); }
});
it('reads without mutation and dispatches exactly one eligible position with fresh permission checks', async () => {
  const h = await harness(), signal = new AbortController().signal;
  const run = await h.service.read('run', signal); expect(h.posts()).toHaveLength(0);
  h.set(ready(), 202); await h.service.dispatch(run, 0, signal); expect(h.posts()).toHaveLength(1);
  await expect(h.service.dispatch(run, 1, signal)).rejects.toMatchObject({ kind: 'conflict' });
  h.deny(); await expect(h.service.dispatch(run, 0, signal)).rejects.toMatchObject({ kind: 'forbidden' }); expect(h.posts()).toHaveLength(1);
});
it('fails closed for old Core and absent revision without legacy scene fallback', async () => {
  const h = await harness(), signal = new AbortController().signal;
  await expect(h.service.create('scene', undefined as unknown as number, 'key', signal)).rejects.toThrow(); expect(h.posts()).toHaveLength(0);
  h.set(ready(), 404); await expect(h.service.create('scene', 3, 'same-intent-key-123', signal)).rejects.toMatchObject({ kind: 'not-found' }); expect(h.posts()).toHaveLength(1);
});
