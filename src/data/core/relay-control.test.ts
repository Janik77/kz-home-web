import { afterEach, expect, it, vi } from 'vitest';
import { createRelayControl, decodeReceipt } from './relay-control';
import { CoreSession } from './session';
import { HttpClient } from './http-client';
import { coreDevice, coreUser, tokenPair } from '../../test/core-fixtures';

afterEach(() => vi.useRealTimers());
async function harness() {
  let device = { ...coreDevice, type: 'relay', capabilities: ['on_off'], online: true };
  let member = true;
  let response = 202;
  let result = { command_id: 'command', correlation_id: 'correlation', house_id: 'house-a', device_id: device.id,
    requested_on: true, status: 'dispatched', expires_at: new Date(Date.now() + 30_000).toISOString(), failure_code: null as string | null };
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const path = String(url);
    if (path.endsWith('/auth/login')) return Response.json(tokenPair);
    if (path.endsWith('/auth/me')) return Response.json(coreUser);
    if (path.endsWith('/auth/logout')) return new Response(null, { status: 204 });
    if (path.endsWith('/me/permissions')) return Response.json({house_id:'house-a', permissions: member ? ['device.control','device.read'] : ['device.read']});
    if (path.includes('/devices?')) return Response.json([device]);
    return Response.json(result, { status: options?.method === 'POST' ? response : 200 });
  });
  const session = new CoreSession(new HttpClient('/core-api', fetcher));
  await session.login('test@example.test', 'test');
  const control = createRelayControl(session, 'house-a');
  return { control, session, fetcher, deviceId: device.id,
    setDevice: (value: Partial<typeof device>) => { device = { ...device, ...value }; },
    setMember: (value: boolean) => { member = value; },
    setResponse: (value: number) => { response = value; },
    setResult: (value: Partial<typeof result>) => { result = { ...result, ...value }; },
    posts: () => fetcher.mock.calls.filter(([url, o]) => String(url).includes('/commands') && o?.method === 'POST'),
  };
}
it.each([true, false])('waits for applied ON/OFF (%s), sends authenticated intent exactly once', async on => {
  vi.useFakeTimers(); const h = await harness(); h.setResult({ requested_on: on });
  const update = vi.fn(); const operation = h.control.run(h.deviceId, on, update, new AbortController().signal);
  await vi.advanceTimersByTimeAsync(0);
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'dispatched' }));
  await vi.advanceTimersByTimeAsync(2000);
  expect(update.mock.calls.every(([r]) => r.status !== 'applied')).toBe(true);
  h.setResult({ status: 'applied' }); await vi.advanceTimersByTimeAsync(1000);
  expect((await operation).status).toBe('applied');
  expect(h.posts()).toHaveLength(1);
  const options = h.posts()[0]![1]!;
  expect(options.body).toBe(JSON.stringify({ on }));
  expect(new Headers(options.headers).get('Authorization')).toBe(`Bearer ${tokenPair.access_token}`);
  const key = new Headers(options.headers).get('Idempotency-Key'); expect(key).toMatch(/^[a-f0-9-]{36}$/);
  await h.control.run(h.deviceId, on, update, new AbortController().signal);
  expect(new Headers(h.posts()[1]![1]!.headers).get('Idempotency-Key')).not.toBe(key);
});
it('suppresses duplicate calls, cancels polling without resending', async () => {
  vi.useFakeTimers(); const h = await harness(); const abort = new AbortController(); const update = vi.fn();
  const operation = h.control.run(h.deviceId, true, update, abort.signal);
  const assertion = expect(operation).rejects.toHaveProperty('name', 'AbortError');
  await expect(h.control.run(h.deviceId, true, update, abort.signal)).rejects.toMatchObject({ kind: 'conflict' });
  await vi.advanceTimersByTimeAsync(0); abort.abort(); await assertion;
  const calls = h.fetcher.mock.calls.length; await vi.advanceTimersByTimeAsync(60_000);
  expect(h.fetcher).toHaveBeenCalledTimes(calls); expect(h.posts()).toHaveLength(1);
});
it.each([{ online: false }, { capabilities: [] }, { type: 'socket' }, { type: 'light' }])('blocks unsupported/offline %j', async device => {
  const h = await harness(); h.setDevice(device);
  await expect(h.control.run(h.deviceId, true, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ kind: 'forbidden' });
  expect(h.posts()).toHaveLength(0);
});
it('does not infer control permission from device read', async () => {
  const h = await harness(); h.setMember(false);
  expect(await h.control.eligible(new AbortController().signal)).toEqual([]);
  await expect(h.control.run(h.deviceId, true, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ kind: 'forbidden' });
  expect(h.posts()).toHaveLength(0);
});
it.each([401, 403, 404, 409, 422, 429, 500, 503])('does not replay POST on HTTP %s', async status => {
  const h = await harness(); h.setResponse(status);
  await expect(h.control.run(h.deviceId, true, vi.fn(), new AbortController().signal)).rejects.toThrow();
  expect(h.posts()).toHaveLength(1);
  if (status === 401) expect(h.session.getSnapshot().status).toBe('anonymous');
});
it.each(['timed_out', 'failed'])('stops on terminal %s without success', async status => {
  const h = await harness(); h.setResult({ status, failure_code: status === 'failed' ? 'publish_unconfirmed' : 'deadline_exceeded' });
  const update = vi.fn(); expect((await h.control.run(h.deviceId, true, update, new AbortController().signal)).status).toBe(status);
  expect(update).toHaveBeenCalledTimes(1); expect(h.posts()).toHaveLength(1);
});
it('bounds queued/ACK-only observation at the receipt deadline', async () => {
  vi.useFakeTimers(); const h = await harness(); h.setResult({ status: 'queued' });
  const operation = h.control.run(h.deviceId, true, vi.fn(), new AbortController().signal);
  const assertion = expect(operation).rejects.toMatchObject({ kind: 'network' });
  await vi.advanceTimersByTimeAsync(30_000); await assertion; expect(h.posts()).toHaveLength(1);
});
it('rejects foreign receipts before publishing updates', async () => {
  const h = await harness(); h.setResult({ house_id: 'other-house', status: 'applied' }); const update = vi.fn();
  await expect(h.control.run(h.deviceId, true, update, new AbortController().signal)).rejects.toMatchObject({ kind: 'protocol' });
  expect(update).not.toHaveBeenCalled();
});
it('cancels polling on session logout', async () => {
  vi.useFakeTimers(); const h = await harness();
  const operation = h.control.run(h.deviceId, true, vi.fn(), new AbortController().signal);
  const assertion = expect(operation).rejects.toHaveProperty('name', 'AbortError');
  await vi.advanceTimersByTimeAsync(0); await h.session.logout(); await assertion;
  expect(h.posts()).toHaveLength(1);
});
it('rejects malformed receipts', () => { expect(() => decodeReceipt({ status: 'success' })).toThrow(); });
it('never retries a POST whose response was lost', async () => {
  const h = await harness(); const original = h.fetcher.getMockImplementation()!;
  h.fetcher.mockImplementation(async (url, options) => {
    if (options?.method === 'POST') throw new TypeError('Connection lost after delivery');
    return original(url, options);
  });
  await expect(h.control.run(h.deviceId, true, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ kind: 'network' });
  expect(h.posts()).toHaveLength(1);
});
it('ignores a late polling response after house/component cancellation', async () => {
  vi.useFakeTimers(); const h = await harness(); const original = h.fetcher.getMockImplementation()!;
  let finish!: (response: Response) => void;
  h.fetcher.mockImplementation(async (url, options) => {
    if (String(url).includes('/commands/') && options?.method === 'GET') return new Promise(resolve => { finish = resolve; });
    return original(url, options);
  });
  const update = vi.fn(); const abort = new AbortController();
  const operation = h.control.run(h.deviceId, true, update, abort.signal);
  const assertion = expect(operation).rejects.toHaveProperty('name', 'AbortError');
  await vi.advanceTimersByTimeAsync(1000); abort.abort();
  finish(Response.json({ ...update.mock.calls[0]![0], status: 'applied' })); await assertion;
  expect(update).toHaveBeenCalledTimes(1); expect(h.posts()).toHaveLength(1);
});
