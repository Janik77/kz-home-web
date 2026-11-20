import { describe, expect, it } from 'vitest';
import { parseLanCore } from './endpoint';

describe('Android Core endpoint', () => {
  it.each(['https://10.0.2.2:8443', 'https://172.16.1.3', 'https://172.31.2.3', 'https://192.168.1.20'])('accepts %s', url => {
    expect(parseLanCore(` ${url}/ `)).toBe(url);
  });
  it.each([
    'http://192.168.1.20', 'https://127.0.0.1:39225', 'https://8.8.8.8',
    'https://172.32.0.1', 'https://172.15.0.1', 'https://api.example.com',
    'https://user@192.168.1.20', 'https://192.168.1.20#frag', 'https://192.168.1.20?x=1',
    'https://192.168.1.20/subpath', 'https://192.168.001.20', 'https://192.168.1.999',
    'https://192.168.0.1:0', 'https://192.168.0.1:99999', 'https://3232235796',
  ])('refuses %s', url => expect(() => parseLanCore(url)).toThrow());
});
