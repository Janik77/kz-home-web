import { describe, expect, it, vi } from 'vitest';
import type { CapacitorHttp } from '@capacitor/core';
import { HttpClient } from '../data/core/http-client';
import { nativeCoreFetcher } from './transport';
const origin = 'https://192.168.1.20:8443';
const reply = (status: number, data: unknown = {}) => ({ url: origin, status, headers: { 'Content-Type': 'application/json' }, data });

describe('native Core bridge transport', () => {
  it('preserves the shared behavior and sends one JSON write without redirects', async () => {
    const send = vi.fn<typeof CapacitorHttp.request>().mockResolvedValueOnce(reply(202, { answer: 1 }));
    const client = new HttpClient(origin, nativeCoreFetcher(origin, send));
    await expect(client.request('/commands', value => value,
      { method: 'POST', token: 'test-access', idempotencyKey: 'command-test-id', body: { value: true }, expectedStatus: 202 })).resolves.toEqual({ answer: 1 });
    expect(send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      url: `${origin}/commands`, method: 'POST', data: { value: true }, disableRedirects: true,
      headers: expect.objectContaining({ authorization: 'Bearer test-access', 'idempotency-key': 'command-test-id' }),
    }));
  });
  it('refuses a changed host, insecure origin, or redirect and never retries', async () => {
    const send = vi.fn<typeof CapacitorHttp.request>().mockResolvedValueOnce(reply(307));
    const fetcher = nativeCoreFetcher(origin, send);
    const opts = { credentials: 'omit', redirect: 'error' } as const;
    await expect(fetcher('https://192.168.1.21/path', opts)).rejects.toThrow();
    await expect(nativeCoreFetcher('http://192.168.1.20', send)('http://192.168.1.20/path', opts)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    await expect(fetcher(`${origin}/redirect`, opts)).rejects.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('maps cancellation after a send to an unknown result without another send', async () => {
    const send = vi.fn<typeof CapacitorHttp.request>().mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();
    const promise = nativeCoreFetcher(origin, send)(`${origin}/commands`, { credentials: 'omit', redirect: 'error', signal: controller.signal, method: 'POST' });
    controller.abort();
    await expect(promise).rejects.toHaveProperty('name', 'AbortError');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
