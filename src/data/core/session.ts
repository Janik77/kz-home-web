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

/** Per-tab memory only. Passwords/tokens never enter React state, Query, or storage. */
export class CoreSession {
  private tokens: TokenPair | null = null;
  private expiresAt = 0;
  private revision = 0;
  private refreshInFlight: Promise<void> | null = null;
  private snapshot: SessionSnapshot = { status: 'anonymous', user: null, message: null };
  private listeners = new Set<() => void>();
  constructor(private readonly http: HttpClient, private readonly now = Date.now) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(snapshot: SessionSnapshot) { this.snapshot = snapshot; for (const listener of this.listeners) listener(); }
  private forget(message: string | null) {
    this.revision++; this.tokens = null; this.expiresAt = 0;
    this.publish({ status: 'anonymous', user: null, message });
  }
  private accept(tokens: TokenPair) { this.tokens = tokens; this.expiresAt = this.now() + tokens.expires_in * 1000; }

  async login(email: string, password: string): Promise<void> {
    if (this.snapshot.status !== 'anonymous') return;
    const revision = ++this.revision;
    this.publish({ status: 'authenticating', user: null, message: null });
    let pair: TokenPair | null = null;
    try {
      pair = await this.http.request('/auth/login', decodeTokens, { method: 'POST', body: { email, password } });
      const user = await this.http.request('/auth/me', decodeUser, { token: pair.access_token });
      if (revision !== this.revision) return;
      this.accept(pair); this.publish({ status: 'authenticated', user, message: null });
    } catch (error) {
      if (pair) {
        try { await this.http.request('/auth/logout', () => undefined, { method: 'POST', body: { refresh_token: pair.refresh_token } }); } catch { /* Best-effort revocation after an incomplete login. */ }
      }
      if (revision === this.revision) this.forget(error instanceof CoreError && error.kind === 'unauthorized'
        ? 'The email or password wasn’t accepted. Please try again.' : coreErrorMessage(error));
    }
  }

  private refresh(): Promise<void> {
    if (this.refreshInFlight) return this.refreshInFlight;
    if (!this.tokens) return Promise.reject(new CoreError('unauthorized'));
    const revision = this.revision;
    const refreshToken = this.tokens.refresh_token;
    const operation = this.http.request('/auth/refresh', decodeTokens, { method: 'POST', body: { refresh_token: refreshToken } })
      .then((pair) => { if (revision === this.revision) this.accept(pair); else throw new CoreError('unauthorized'); })
      .catch((error: unknown) => {
        // Never retry a rotating refresh after a lost response: the old token may be consumed.
        if (revision === this.revision) this.forget(error instanceof CoreError && error.kind === 'unauthorized'
          ? 'Your session has expired. Sign in again to continue.' : 'Your session couldn’t be renewed. Sign in again to continue.');
        throw error;
      }).finally(() => { if (this.refreshInFlight === operation) this.refreshInFlight = null; });
    this.refreshInFlight = operation;
    return operation;
  }

  async read<T>(path: string, decode: (value: unknown) => T, signal?: AbortSignal): Promise<T> {
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
      if (revision !== this.revision) throw new CoreError('unauthorized');
      return result;
    } catch (error) {
      if (!(error instanceof CoreError) || error.kind !== 'unauthorized' || revision !== this.revision) throw error;
      // Concurrent 401s for an old token share rotation; a later one uses the new pair.
      if (this.tokens?.access_token === token) await this.refresh();
      signal?.throwIfAborted();
      if (!this.tokens || revision !== this.revision) throw new CoreError('unauthorized');
      try {
        const result = await perform(this.tokens.access_token);
        if (revision !== this.revision) throw new CoreError('unauthorized');
        return result;
      } catch (retryError) {
        if (retryError instanceof CoreError && retryError.kind === 'unauthorized' && revision === this.revision) {
          this.forget('Your session has expired. Sign in again to continue.');
        }
        throw retryError;
      }
    }
  }

  /** Mutations are sent once. A 401 expires the session; never replay a POST. */
  async command<T>(path: string, body: unknown, key: string, decode: (value: unknown) => T, signal: AbortSignal): Promise<T> {
    const revision = this.revision;
    if (this.snapshot.status !== 'authenticated' || !this.tokens) throw new CoreError('unauthorized');
    if (this.now() >= this.expiresAt - 5_000) await this.refresh();
    signal.throwIfAborted();
    if (revision !== this.revision || !this.tokens || this.snapshot.status !== 'authenticated') throw new CoreError('unauthorized');
    try {
      const result = await this.http.request(path, decode, { method: 'POST', body, idempotencyKey: key,
        expectedStatus: 202, token: this.tokens.access_token, signal });
      signal.throwIfAborted();
      if (revision !== this.revision) throw new CoreError('unauthorized');
      return result;
    } catch (error) {
      if (error instanceof CoreError && error.kind === 'unauthorized' && revision === this.revision) this.forget('Your session has expired. Sign in again to continue.');
      throw error;
    }
  }

  async logout(): Promise<void> {
    if (this.snapshot.status !== 'authenticated') return;
    this.publish({ status: 'signing-out', user: null, message: null });
    // A rotation already in flight must settle before revoking its current token.
    try { await this.refreshInFlight; } catch { /* Session was already cleared. */ }
    const token = this.tokens?.refresh_token;
    this.revision++; this.tokens = null; this.expiresAt = 0;
    let message: string | null = null;
    if (token) {
      try { await this.http.request('/auth/logout', () => undefined, { method: 'POST', body: { refresh_token: token } }); }
      catch (error) { if (!(error instanceof CoreError && error.kind === 'unauthorized')) message = 'Signed out on this device. Core couldn’t confirm session revocation.'; }
    }
    this.publish({ status: 'anonymous', user: null, message });
  }
}
