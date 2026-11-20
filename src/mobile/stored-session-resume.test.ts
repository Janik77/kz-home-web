import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../data/core/http-client';
import { CoreSession, type RefreshVault } from '../data/core/session';
import { coreUser, tokenPair } from '../test/core-fixtures';
import { checkCoreReadiness, createStoredSessionResume } from './stored-session-resume';

const origin = 'https://192.168.4.2:8443';
const json = (body: unknown, status = 200) => Response.json(body, { status });

function fixture() {
  let kept: string | null = 'synthetic-old-refresh';
  const vault = {
    take: vi.fn(async () => { const token = kept; kept = null; return token; }),
    save: vi.fn(async (token: string) => { kept = token; }),
    clear: vi.fn(async () => { kept = null; }),
  } satisfies RefreshVault;
  const fetcher = vi.fn<typeof fetch>();
  const client = new HttpClient(origin, fetcher);
  const session = new CoreSession(client, Date.now, vault);
  const stillEligible = () => session.getSnapshot().status === 'anonymous';
  const attempt = createStoredSessionResume(() => checkCoreReadiness(client), () => session.resume());
  return { client, fetcher, session, vault, stillEligible, attempt, kept: () => kept };
}

describe('Android cold-start session gate', () => {
  it('reproduces the original premature token loss when Core is offline despite Wi-Fi', async () => {
    const f = fixture();
    f.fetcher.mockRejectedValueOnce(new TypeError('Core offline'));
    await f.session.resume(); // Original Android workspace called this before any /health.
    expect(f.fetcher.mock.calls[0]?.[0]).toBe(origin + '/auth/refresh');
    expect(f.vault.take).toHaveBeenCalledTimes(1);
    expect(f.kept()).toBeNull();
  });

  it('preserves the token through two unavailable probes, then coalesces recovery into one rotation', async () => {
    const f = fixture();
    f.fetcher.mockRejectedValueOnce(new TypeError('Core stopped')).mockResolvedValueOnce(json({ status: 'starting' }, 503));
    await f.attempt(f.stillEligible);
    await f.attempt(f.stillEligible);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
    expect(f.vault.take).not.toHaveBeenCalled();
    expect(f.kept()).toBe('synthetic-old-refresh');

    let ready!: (response: Response) => void;
    f.fetcher.mockImplementationOnce(() => new Promise(resolve => { ready = resolve; }))
      .mockResolvedValueOnce(json(tokenPair)).mockResolvedValueOnce(json(coreUser));
    const recovery = f.attempt(f.stillEligible);
    expect(f.attempt(f.stillEligible)).toBe(recovery);
    await Promise.resolve();
    ready(json({ status: 'ready' }));
    await recovery;
    await f.attempt(f.stillEligible);
    expect(f.vault.take).toHaveBeenCalledTimes(1);
    expect(f.vault.save).toHaveBeenCalledExactlyOnceWith(tokenPair.refresh_token);
    expect(f.session.getSnapshot().status).toBe('authenticated');
    const calls = f.fetcher.mock.calls;
    expect(calls.map(([url, init]) => [url, init?.method])).toEqual([
      [origin + '/ready', 'GET'], [origin + '/ready', 'GET'], [origin + '/ready', 'GET'],
      [origin + '/auth/refresh', 'POST'], [origin + '/auth/me', 'GET'],
    ]);
    for (const [, init] of calls.slice(0, 3)) {
      expect(init?.credentials).toBe('omit');
      expect(init?.redirect).toBe('error');
      expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    }
  });

  it('never retries a refresh POST whose response was lost, even on later lifecycle events', async () => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(json({ status: 'ready' }))
      .mockRejectedValueOnce(new TypeError('POST may already have reached Core'));
    await f.attempt(f.stillEligible);
    expect(f.session.getSnapshot().status).toBe('anonymous');
    expect(f.kept()).toBeNull();
    expect(f.vault.take).toHaveBeenCalledTimes(1);
    expect(f.vault.save).not.toHaveBeenCalled();
    await Promise.all([f.attempt(f.stillEligible), f.attempt(f.stillEligible)]);
    expect(f.fetcher.mock.calls.map(([url]) => url)).toEqual([origin + '/ready', origin + '/auth/refresh']);
  });

  it('does not touch the vault if the selected connection ceases to be eligible before probing finishes', async () => {
    const f = fixture();
    let allowed = true;
    f.fetcher.mockImplementationOnce(async () => { allowed = false; return json({ status: 'ready' }); });
    await f.attempt(() => allowed);
    expect(f.vault.take).not.toHaveBeenCalled();
    expect(f.kept()).toBe('synthetic-old-refresh');
  });

  it.each([
    ['healthy-only JSON', () => json({ status: 'ok' })],
    ['SPA fallback', () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })],
    ['unrouted path', () => json({ detail: 'Not Found' }, 404)],
    ['wrong schema revision', () => json({ status: 'not_ready', reason: 'schema_revision_mismatch' }, 503)],
  ])('preserves the token on an invalid readiness response: %s', async (_name, reply) => {
    const f = fixture();
    f.fetcher.mockResolvedValueOnce(reply());
    await f.attempt(f.stillEligible);
    expect(f.vault.take).not.toHaveBeenCalled();
  });
});
