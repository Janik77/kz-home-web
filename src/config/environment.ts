export type Environment = { mode: 'mock' } | { mode: 'core'; apiUrl: string };

export function parseEnvironment(values: Record<string, unknown>): Environment {
  const mode = values.VITE_DATA_MODE ?? 'mock';
  if (mode === 'mock') return { mode };
  if (mode !== 'core') throw new Error('VITE_DATA_MODE must be mock or core.');
  const raw = values.VITE_API_URL;
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('Core mode requires VITE_API_URL.');
  const apiUrl = raw.trim().replace(/\/+$/, '');
  if (/^\/(?!\/)[a-zA-Z0-9/_-]+$/.test(apiUrl)) return { mode, apiUrl };
  let url: URL;
  try { url = new URL(apiUrl); } catch { throw new Error('VITE_API_URL must be an HTTPS URL or a same-origin path.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use HTTPS for remote Core connections. API URLs cannot contain credentials, queries or fragments.');
  }
  return { mode, apiUrl };
}
