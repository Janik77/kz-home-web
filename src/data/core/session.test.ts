import { describe, expect, it, vi } from 'vitest';
import { CoreSession } from './session';
import { HttpClient } from './http-client';
import { coreUser, tokenPair } from '../../test/core-fixtures';

function harness() {
  const fetcher = vi.fn<typeof fetch>();
  let now = 1_000;
  const session = new CoreSession(new HttpClient('/core-api', fetcher), () => now);
  const login = async () => {
    fetcher.mockResolvedValueOnce(Response.json(tokenPair)).mockResolvedValueOnce(Response.json(coreUser));
    await session.login('homeowner@example.test', 'test-input');
  };
  return { fetcher, session, login, advance: () => { now += 900_000; } };
}
const rotated = { ...tokenPair, access_token: 'test-access-2', refresh_token: 'test-refresh-2' };

describe('memory-only Core session', () => {
  it('verifies me before exposing a session; credentials never enter snapshots or storage', async () => {
    const { fetcher, session, login } = harness();
    const persist = vi.spyOn(Storage.prototype, 'setItem');
    await login();
    expect(session.getSnapshot()).toEqual({ status: 'authenticated', user: { id: coreUser.id, email: coreUser.email }, message: null });
    expect(fetcher.mock.calls[1]?.[0]).toBe('/core-api/auth/me');
    expect(JSON.stringify(session.getSnapshot())).not.toContain('test-access');
    expect(persist).not.toHaveBeenCalled();
    expect(new CoreSession(new HttpClient('/core-api', fetcher)).getSnapshot().status).toBe('anonymous');
  });
  it('shows safe invalid-credential feedback and blocks duplicate logins', async () => {
    const { fetcher, session } = harness();
    fetcher.mockResolvedValueOnce(Response.json({ detail: 'private-input' }, { status: 401 }));
    await Promise.all([session.login('test@example.test', 'wrong'), session.login('test@example.test', 'wrong')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({ status: 'anonymous', message: 'The email or password wasn’t accepted. Please try again.' });
  });
  it('rotates once for concurrent expired reads and revokes the new refresh token on logout', async () => {
    const { fetcher, session, login, advance } = harness(); await login(); advance();
    fetcher.mockResolvedValueOnce(Response.json(rotated)).mockImplementation(async () => Response.json([]));
    await Promise.all([session.read('/houses', (v) => v), session.read('/floors', (v) => v)]);
    expect(fetcher.mock.calls.filter(([url]) => url === '/core-api/auth/refresh')).toHaveLength(1);
    expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get('Authorization')).toBe('Bearer test-access-2');
    fetcher.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await session.logout();
    expect(fetcher.mock.calls.at(-1)?.[1]?.body).toBe('{"refresh_token":"test-refresh-2"}');
    expect(session.getSnapshot().status).toBe('anonymous');
  });
  it('shares rotation after concurrent 401s and never refreshes a 403', async () => {
    const { fetcher, session, login } = harness(); await login();
    fetcher.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json(rotated)).mockImplementation(async () => Response.json([]));
    await Promise.all([session.read('/houses', (v) => v), session.read('/floors', (v) => v)]);
    expect(fetcher.mock.calls.filter(([url]) => url === '/core-api/auth/refresh')).toHaveLength(1);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(session.read('/rooms', (v) => v)).rejects.toMatchObject({ kind: 'forbidden' });
    expect(session.getSnapshot().status).toBe('authenticated');
  });
  it('expires on rejected refresh or a lost rotating response without retrying it', async () => {
    for (const response of [new Response(null, { status: 401 }), new TypeError('network')]) {
      const { fetcher, session, login, advance } = harness(); await login(); advance();
      if (response instanceof Response) fetcher.mockResolvedValueOnce(response); else fetcher.mockRejectedValueOnce(response);
      await expect(session.read('/houses', (v) => v)).rejects.toThrow();
      expect(session.getSnapshot().status).toBe('anonymous');
      expect(session.getSnapshot().message).toMatch(/Sign in again/);
      expect(fetcher.mock.calls.filter(([url]) => url === '/core-api/auth/refresh')).toHaveLength(1);
    }
  });
  it('clears local state when logout cannot confirm remote revocation', async () => {
    const { fetcher, session, login } = harness(); await login();
    fetcher.mockRejectedValueOnce(new TypeError('network'));
    await session.logout();
    expect(session.getSnapshot()).toMatchObject({ status: 'anonymous', message: 'Signed out on this device. Core couldn’t confirm session revocation.' });
    await expect(session.read('/houses', (v) => v)).rejects.toMatchObject({ kind: 'unauthorized' });
  });
  it('does not accept a late read after signout', async () => {
    const { fetcher, session, login } = harness(); await login();
    let finish!: (response: Response) => void;
    fetcher.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const read = session.read('/houses', (v) => v);
    const assertion = expect(read).rejects.toMatchObject({ kind: 'unauthorized' });
    await session.logout(); finish(Response.json([])); await assertion;
    expect(session.getSnapshot().status).toBe('anonymous');
  });
  it('waits for an in-flight rotation then revokes the rotated token during signout', async () => {
    const { fetcher, session, login, advance } = harness(); await login(); advance();
    let finish!: (response: Response) => void;
    fetcher.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
      .mockImplementation(async (url) => String(url).endsWith('/auth/logout') ? new Response(null, { status: 204 }) : Response.json([]));
    const read = session.read('/houses', (v) => v);
    const assertion = expect(read).rejects.toMatchObject({ kind: 'unauthorized' });
    const logout = session.logout();
    expect(session.getSnapshot().status).toBe('signing-out');
    finish(Response.json(rotated));
    await logout; await assertion;
    expect(fetcher.mock.calls.at(-1)?.[1]?.body).toBe('{"refresh_token":"test-refresh-2"}');
    expect(session.getSnapshot().status).toBe('anonymous');
  });
  it('keeps shared refresh alive when one read is cancelled', async () => {
    const { fetcher, session, login, advance } = harness(); await login(); advance();
    let finish!: (response: Response) => void;
    fetcher.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; })).mockImplementation(async () => Response.json([]));
    const controller = new AbortController();
    const first = session.read('/houses', (v) => v, controller.signal);
    const assertion = expect(first).rejects.toHaveProperty('name', 'AbortError');
    const second = session.read('/floors', (v) => v);
    controller.abort(); finish(Response.json(rotated));
    await assertion; expect(await second).toEqual([]);
    expect(session.getSnapshot().status).toBe('authenticated');
  });
});
