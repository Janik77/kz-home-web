import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

/** Fail closed: only the verified local Compose project and its isolated DB. */
export function disposableAccount() {
  const python = process.env.LIVE_CORE_PYTHON;
  if (!python) throw new Error('Set LIVE_CORE_PYTHON to the Core SDK executable after checking its IDE configuration.');
  const source = process.env.LIVE_CORE_SOURCE ?? 'C:/projects/kz-home-core';
  const inspect = JSON.parse(execFileSync('docker', ['inspect', 'kzhome-local-core-1', 'kzhome-local-postgres-1'], { encoding: 'utf8' }));
  const [core, postgres] = inspect;
  const corePort = core.NetworkSettings.Ports['8000/tcp'];
  const dbPort = postgres.NetworkSettings.Ports['5432/tcp'];
  if (!corePort?.some((p: { HostIp: string; HostPort: string }) => p.HostIp === '127.0.0.1' && p.HostPort === '18000')
    || !dbPort?.some((p: { HostIp: string; HostPort: string }) => p.HostIp === '127.0.0.1' && p.HostPort === '15432')) {
    throw new Error('Expected verified loopback Core/database port mappings.');
  }
  if (core.Config.Labels['com.docker.compose.project'] !== 'kzhome-local' || postgres.Config.Labels['com.docker.compose.project'] !== 'kzhome-local'
    || !postgres.Mounts.some((m: { Name: string; Destination: string }) => m.Name === 'kzhome-local_local_postgres_data' && m.Destination === '/var/lib/postgresql/data')) {
    throw new Error('Expected isolated local Compose project/volume.');
  }
  const env = Object.fromEntries(core.Config.Env.map((entry: string) => { const i = entry.indexOf('='); return [entry.slice(0, i), entry.slice(i + 1)]; }));
  if (env.APP_ENV !== 'local' || !env.DATABASE_URL?.endsWith('@postgres:5432/kzhome_local')) throw new Error('Expected local database.');
  const prefix = `web-live-${randomUUID().replaceAll('-', '')}`;
  const password = randomBytes(32).toString('base64url');
  const email = `${prefix}@example.invalid`;
  const ids = { home: `${prefix}-home`, empty: `${prefix}-empty`, floor: `${prefix}-floor`, room: `${prefix}-room`, light: `${prefix}-light`, scene: `${prefix}-scene` };
  function operator(action: 'create' | 'inspect' | 'cleanup') {
    const result = spawnSync(python!, [resolve('e2e/live-core-fixture.py')], {
      input: JSON.stringify({ prefix, action, ...(action === 'create' ? { password } : {}) }),
      encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1', LIVE_CORE_SOURCE: source,
        LIVE_CORE_DATABASE_URL: env.DATABASE_URL.replace('@postgres:5432/', '@127.0.0.1:15432/') },
    });
    // Never echo subprocess input, environment, or credentials on failure.
    if (result.status !== 0) throw new Error(`Local operator ${action} failed (exit ${result.status}); inspect the scoped helper, not credential logs.`);
    return JSON.parse(result.stdout);
  }
  return { prefix, email, password, ids, operator };
}
