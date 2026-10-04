import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { parseEnvironment } from './src/config/environment.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.CORE_DEV_PROXY_TARGET;
  let proxy;
  if (target) {
    const config = parseEnvironment({ VITE_DATA_MODE: 'core', VITE_API_URL: target });
    if (config.mode !== 'core' || !/^https?:\/\//.test(config.apiUrl)) throw new Error('CORE_DEV_PROXY_TARGET must be an absolute safe URL.');
    proxy = { '/core-api': { target: config.apiUrl, changeOrigin: false, rewrite: (path: string) => path.replace(/^\/core-api(?=\/|$)/, '') } };
  }
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', ...(proxy ? { proxy } : {}) },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
