import type { SessionUser } from '../../domain/session';
import { decodeTokens, decodeUser } from './dtos';
import type { TokenPair } from './dtos';
import { CoreError, coreErrorMessage } from './errors';
import type { HttpClient } from './http-client';

export interface SessionSnapshot {
  status: 'anonymous' | 'authenticating' | 'authenticated' | 'signing-out';
  user: SessionUser | null;
  message: string | null;
}

export interface RefreshVault {
  /** Atomically remove the persisted refresh token before returning it. */
  take(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

/** Browser: memory only. Android can persist only the rotating token through its native vault. */
export class CoreSession {
  private tokens: TokenPair | null = null;
  private expiresAt = 0;
  private revision = 0;
  private lifetime = new AbortController();
  private refreshInFlight: Promise<void> | null = null;
  private snapshot: SessionSnapshot = { status: 'anonymous', user: null, message: null };
  private listeners = new Set<() => void>();
  constructor(private readonly http: HttpClient, private readonly now = Date.now, private readonly vault?: RefreshVault) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(snapshot: SessionSnapshot) { this.snapshot = snapshot; for (const listener of this.listeners) listener(); }
  private forget(message: string | null) {
    this.lifetime.abort(new CoreError('unauthorized'));
    this.revision++; this.tokens = null; this.expiresAt = 0;
    this.publish({ status: 'anonymous', user: null, message });
  }
  private accept(tokens: TokenPair) { this.tokens = tokens; this.expiresAt = this.now() + tokens.expires_in * 1000; }

  private async saveRefresh(tokens: TokenPair) {
    // Keystore unavailable: this session still works in memory and requires login after restart.
    try { await this.vault?.save(tokens.refresh_token); } catch { /* fail closed */ }
  }

  async resume(): Promise<void> {
    if (!this.vault || this.snapshot.status !== 'anonymous') return;
    const revision = ++this.revision;
    this.lifetime = new AbortController();
    this.publish({ status: 'authenticating', user: null, message: null });
    try {
      const token = await this.vault.take();
      if (!token) { this.forget(null); return; }
      const pair = await this.http.request('/auth/refresh', decodeTokens, { method: 'POST', body: { refresh_token: token } });
      const user = await this.http.request('/auth/me', decodeUser, { token: pair.access_token });
      if (revision !== this.revision) return;
      await this.saveRefresh(pair);
      this.accept(pair); this.publish({ status: 'authenticated', user, message: null });
    } catch (error) {
      if (revision === this.revision) this.forget(error instanceof CoreError && error.kind === 'network'
        ? 'Не удалось восстановить сеанс. Подключитесь к домашнему Wi‑Fi и войдите снова.'
        : 'Сохранённый сеанс недоступен. Войдите снова.');
    }
  }

  async login(email: string, password: string): Promise<void> {
    if (this.snapshot.status !== 'anonymous') return;
    const revision = ++this.revision;
    this.lifetime = new AbortController();
    this.publish({ status: 'authenticating', user: null, message: null });
    let pair: TokenPair | null = null;
    try {
      pair = await this.http.request('/auth/login', decodeTokens, { method: 'POST', body: { email, password } });
      const user = await this.http.request('/auth/me', decodeUser, { token: pair.access_token });
      if (revision !== this.revision) return;
      if (this.vault) await this.saveRefresh(pair);
      this.accept(pair); this.publish({ status: 'authenticated', user, message: null });
    } catch (error) {
      if (pair) {
        try { await this.http.request('/auth/logout', () => undefined, { method: 'POST', body: { refresh_token: pair.refresh_token } }); } catch { /* Best-effort revocation after an incomplete login. */ }
      }
      if (revision === this.revision) this.forget(error instanceof CoreError && error.kind === 'unauthorized'
        ? 'Неверная почта или пароль. Попробуйте ещё раз.' : coreErrorMessage(error));
    }
  }

  private refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    if (!this.tokens) return Promise.reject(new CoreError('unauthorized'));
    const revision = this.revision;
    const refreshToken = this.tokens.refresh_token;
    const rotate = () => this.http.request('/auth/refresh', decodeTokens, { method: 'POST', body: { refresh_token: refreshToken } });
    const operation = (this.vault ? this.vault.clear().then(rotate) : rotate())
      .then(async (pair) => {
        if (revision !== this.revision) throw new CoreError('unauthorized');
        if (this.vault && this.snapshot.status === 'authenticated') await this.saveRefresh(pair);
        this.accept(pair);
      })
      .catch((error: unknown) => {
        // Never retry a rotating refresh after a lost response: the old token may be consumed.
        if (revision === this.revision) this.forget(error instanceof CoreError && error.kind === 'unauthorized'
          ? 'Сеанс истёк. Войдите снова.' : 'Не удалось продлить сеанс. Войдите снова.');
        throw error;
      }).finally(() => { if (this.refreshInFlight === operation) this.refreshInFlight = null; });
    this.refreshInFlight = operation;
    return operation;
  }

  async read<T>(path: string, decode: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
    signal = AbortSignal.any([this.lifetime.signal, ...(signal ? [signal] : [])]);
    if (this.snapshot.status !== 'authenticated' || !this.tokens) throw new CoreError('unauthorized');
    const revision = this.revision;
    signal?.throwIfAborted();
    if (this.now() >= this.expiresAt - 5_000) await this.refresh();
    signal?.throwIfAborted();
    if (revision !== this.revision || !this.tokens) throw new CoreError('unauthorized');
    const token = this.tokens.access_token;
    const perform = (access: string) => this.http.request(path, decode, { token: access, signal });
    try {
      const result = await perform(token);
      signal?.throwIfAborted();
      if (revision !== this.revision) throw new CoreError('unauthorized');
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof CoreError) || error.kind !== 'unauthorized' || revision !== this.revision) throw error;
      // Concurrent 401s for an old token share rotation; a later one uses the new pair.
      if (this.tokens?.access_token === token) await this.refresh();
      signal?.throwIfAborted();
      if (!this.tokens || revision !== this.revision) throw new CoreError('unauthorized');
      try {
        const result = await perform(this.tokens.access_token);
        signal?.throwIfAborted();
        if (revision !== this.revision) throw new CoreError('unauthorized');
        return result;
      } catch (retryError) {
        if (retryError instanceof CoreError && retryError.kind === 'unauthorized' && revision === this.revision) {
          await this.clearAndExpire();
        }
        throw retryError;
      }
    }
  }

  /** Mutations are sent once. A 401 expires the session; never replay a POST. */
  async command<T>(path: string, body: unknown, key: string, decode: (value: unknown) => T, signal: AbortSignal, expectedStatus: 201 | 202 = 202): Promise<T> {
    signal = AbortSignal.any([signal, this.lifetime.signal]);
    const revision = this.revision;
    if (this.snapshot.status !== 'authenticated' || !this.tokens) throw new CoreError('unauthorized');
    if (this.now() >= this.expiresAt - 5_000) await this.refresh();
    signal.throwIfAborted();
    if (revision !== this.revision || !this.tokens || this.snapshot.status !== 'authenticated') throw new CoreError('unauthorized');
    try {
      const result = await this.http.request(path, decode, { method: 'POST', body, idempotencyKey: key,
        expectedStatus, token: this.tokens.access_token, signal });
      signal.throwIfAborted();
      if (revision !== this.revision) throw new CoreError('unauthorized');
      return result;
    } catch (error) {
      if (error instanceof CoreError && error.kind === 'unauthorized' && revision === this.revision) await this.clearAndExpire();
      throw error;
    }
  }

  /** Mutations are sent once. A 401 expires the session; never replay a definition mutation. */
  async definitionWrite<T>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body: unknown, expectedStatus: 200 | 201 | 204, decode: (value: unknown) => T, signal: AbortSignal): Promise<T> {
    signal = AbortSignal.any([signal, this.lifetime.signal]);
    const revision = this.revision;
    if (this.snapshot.status !== 'authenticated' || !this.tokens) throw new CoreError('unauthorized');
    if (this.now() >= this.expiresAt - 5_000) await this.refresh();
    signal.throwIfAborted();
    if (revision !== this.revision || !this.tokens || this.snapshot.status !== 'authenticated') throw new CoreError('unauthorized');
    try {
      const result = await this.http.request(path, decode, { method, body,
        expectedStatus, token: this.tokens.access_token, signal });
      signal.throwIfAborted();
      if (revision !== this.revision) throw new CoreError('unauthorized');
      return result;
    } catch (error) {
      if (error instanceof CoreError && error.kind === 'unauthorized' && revision === this.revision) await this.clearAndExpire();
      throw error;
    }
  }

  private async clearAndExpire() {
    const revision = this.revision;
    try { await this.vault?.clear(); } catch { /* Native store makes deletion fail closed. */ }
    if (revision === this.revision && this.snapshot.status === 'authenticated') this.forget('Сеанс истёк. Войдите снова.');
  }

  async logout(): Promise<void> {
    if (this.snapshot.status !== 'authenticated') return;
    this.lifetime.abort(new CoreError('unauthorized'));
    this.publish({ status: 'signing-out', user: null, message: null });
    // A rotation already in flight must settle before revoking its current token.
    try { await this.refreshInFlight; } catch { /* Session was already cleared. */ }
    const token = this.tokens?.refresh_token;
    this.revision++; this.tokens = null; this.expiresAt = 0;
    let message: string | null = null;
    try { await this.vault?.clear(); } catch { message = 'Не удалось удалить сохранённый сеанс. Очистите данные приложения.'; }
    if (token) {
      try { await this.http.request('/auth/logout', () => undefined, { method: 'POST', body: { refresh_token: token } }); }
      catch (error) { if (!(error instanceof CoreError && error.kind === 'unauthorized')) message ??= 'Signed out on this device. Core couldn’t confirm session revocation.'; }
    }
    this.publish({ status: 'anonymous', user: null, message });
  }
}
