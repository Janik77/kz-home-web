import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http-client';

describe('Core HTTP transport', () => {
  it('does not bind native fetch to the client object', async () => {
    const fetcher = vi.fn(function (this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(Response.json([]));
    });
    await new HttpClient('/core-api', fetcher).request('/houses', (value) => value);
  });
  it('sends JSON and bearer headers, omits cookies and caching, and rejects redirects', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ready: true }));
    const client = new HttpClient('https://core.example.test', fetcher);
    const controller = new AbortController();
    expect(await client.request('/auth/login', (value) => value, { method: 'POST', body: { email: 'test@example.test' }, token: 'test-token', signal: controller.signal })).toEqual({ ready: true });
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://core.example.test/auth/login');
    expect(options).toMatchObject({ method: 'POST', body: '{"email":"test@example.test"}', credentials: 'omit', cache: 'no-store', redirect: 'error' });
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer test-token');
    expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json');
    controller.abort(); expect(options?.signal?.aborted).toBe(true);
  });
  it.each([[401, 'unauthorized'], [403, 'forbidden'], [404, 'not-found'], [409, 'conflict'], [422, 'validation'], [500, 'server'], [503, 'server']] as const)('classifies %i without retaining raw error input', async (status, kind) => {
    const client = new HttpClient('/core-api', vi.fn<typeof fetch>().mockResolvedValue(Response.json({ detail: 'private-input' }, { status })));
    await expect(client.request('/houses', (value) => value)).rejects.toMatchObject({ kind, status });
    await expect(client.request('/houses', (value) => value)).rejects.not.toHaveProperty('detail');
  });
  it('handles 204, malformed JSON, non-JSON, network failures and abort distinctly', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('{', { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response('<html>'))
      .mockRejectedValueOnce(new TypeError('private network details'));
    const client = new HttpClient('/core-api', fetcher);
    expect(await client.request('/auth/logout', (value) => value)).toBeNull();
    await expect(client.request('/houses', (value) => value)).rejects.toMatchObject({ kind: 'protocol' });
    await expect(client.request('/houses', (value) => value)).rejects.toMatchObject({ kind: 'protocol' });
    await expect(client.request('/houses', (value) => value)).rejects.toMatchObject({ kind: 'network' });
    const controller = new AbortController(); controller.abort();
    fetcher.mockRejectedValueOnce(controller.signal.reason);
    await expect(client.request('/houses', (value) => value, { signal: controller.signal })).rejects.toHaveProperty('name', 'AbortError');
    await expect(client.request('//other.example.test', (value) => value)).rejects.toMatchObject({ kind: 'protocol' });
  });
});
