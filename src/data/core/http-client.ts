import { CoreError } from './errors';

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
  signal?: AbortSignal | undefined;
  idempotencyKey?: string;
  expectedStatus?: number;
}

export class HttpClient {
  constructor(private readonly baseUrl: string, private readonly fetcher: typeof fetch = fetch) {}

  async request<T>(path: string, decode: (value: unknown) => T, options: RequestOptions = {}): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new CoreError('protocol');
    const headers = new Headers({ Accept: 'application/json' });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    const deadline = AbortSignal.timeout(15_000);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    try {
      // Call native browser fetch without binding it to this HttpClient instance.
      const fetcher = this.fetcher;
      const response = await fetcher(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET', headers, signal, credentials: 'omit',
        cache: 'no-store', redirect: 'error',
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      if (!response.ok) {
        const kind = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden'
          : response.status === 404 ? 'not-found' : response.status === 409 ? 'conflict'
          : response.status === 422 ? 'validation' : response.status === 429 ? 'rate-limit' : response.status >= 500 ? 'server' : 'protocol';
        throw new CoreError(kind, response.status);
      }
      if (options.expectedStatus !== undefined && response.status !== options.expectedStatus) throw new CoreError('protocol');
      if (response.status === 204) return decode(null);
      if (!response.headers.get('content-type')?.includes('application/json')) throw new CoreError('protocol');
      let value: unknown;
      try { value = await response.json(); } catch { throw new CoreError('protocol'); }
      return decode(value);
    } catch (error) {
      if (options.signal?.aborted) throw options.signal.reason;
      if (error instanceof CoreError) throw error;
      throw new CoreError('network');
    }
  }
}
