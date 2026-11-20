import { CapacitorHttp } from '@capacitor/core';

type NativeRequest = typeof CapacitorHttp.request;

/** Use the same session/repository client over the Android system's trusted HTTPS transport. */
export function nativeCoreFetcher(origin: string, request: NativeRequest = CapacitorHttp.request): typeof fetch {
  return async (input, options) => {
    if (typeof input !== 'string' || !input.startsWith(`${origin}/`) || new URL(input).origin !== origin
      || !origin.startsWith('https://') || options?.redirect !== 'error' || options.credentials !== 'omit') {
      throw new TypeError('Native request refused');
    }
    const signal = options.signal;
    signal?.throwIfAborted();
    const headers = Object.fromEntries(new Headers(options.headers));
    // String bodies from the shared HttpClient are already serialized as JSON.
    const data = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
    let onAbort: (() => void) | undefined;
    const aborted = signal && new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      const result = request({
        url: input, method: options.method ?? 'GET', headers, data,
        disableRedirects: true, connectTimeout: 7000, readTimeout: 7000, responseType: 'text',
      });
      const reply = await (aborted ? Promise.race([result, aborted]) : result);
      // Native transport cannot cancel requests already processed by Core. Never retry a write.
      signal?.throwIfAborted();
      if (reply.status < 200 || reply.status >= 600 || reply.status >= 300 && reply.status < 400) {
        throw new TypeError('Native response refused');
      }
      const body = [204, 205, 304].includes(reply.status) ? null
        : typeof reply.data === 'string' ? reply.data : JSON.stringify(reply.data);
      return new Response(body, { status: reply.status, headers: reply.headers });
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  };
}
