import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './environment';

describe('public configuration', () => {
  it('defaults to mock only when mode is absent and never falls back from Core', () => {
    expect(parseEnvironment({})).toEqual({ mode: 'mock' });
    expect(parseEnvironment({ VITE_DATA_MODE: 'mock', VITE_API_URL: 'ignored' })).toEqual({ mode: 'mock' });
    expect(() => parseEnvironment({ VITE_DATA_MODE: 'core' })).toThrow('requires VITE_API_URL');
    expect(() => parseEnvironment({ VITE_DATA_MODE: 'typo' })).toThrow();
  });
  it.each(['/core-api', 'https://core.example.test', 'http://127.0.0.1:8000', 'http://localhost:8000', 'http://[::1]:8000'])('accepts safe base %s', (url) => {
    expect(parseEnvironment({ VITE_DATA_MODE: 'core', VITE_API_URL: `${url}/` })).toEqual({ mode: 'core', apiUrl: url });
  });
  it.each(['http://core.example.test', '//core.example.test', 'https://user:password@core.example.test', 'https://core.example.test?token=x', 'https://core.example.test#secret', 'javascript:alert(1)', '/core-api?token=x'])('rejects unsafe base %s', (url) => {
    expect(() => parseEnvironment({ VITE_DATA_MODE: 'core', VITE_API_URL: url })).toThrow();
  });
});
