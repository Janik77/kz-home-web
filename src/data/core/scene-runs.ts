import { boolean, list, object, string } from './dtos';
import { CoreError } from './errors';
import { readHousePermissions } from './permissions';
import { decodeReceipt, type Receipt } from './relay-control';
import type { CoreSession } from './session';

const statuses = ['ready', 'running', 'succeeded', 'stopped', 'unknown', 'expired'] as const;
const actionStatuses = ['ready', 'waiting', 'dispatch_unknown', 'blocked', 'skipped', 'queued', 'dispatched', 'applied', 'failed', 'timed_out'] as const;
export interface RunAction { position: number; device_id: string; requested_on: boolean; status: typeof actionStatuses[number]; failure_code: string | null; receipt: Receipt | null }
export interface SceneRun { id: string; house_id: string; scene_id: string; scene_revision: number; created_at: string; dispatch_deadline: string; status: typeof statuses[number]; actions: RunAction[] }
function integer(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new CoreError('protocol');
  return value;
}
export function decodeSceneRun(value: unknown): SceneRun {
  const v = object(value), house = string(v.house_id);
  if (!statuses.includes(v.status as SceneRun['status'])) throw new CoreError('protocol');
  const created = string(v.created_at), deadline = string(v.dispatch_deadline);
  if (!Number.isFinite(Date.parse(created)) || !Number.isFinite(Date.parse(deadline)) || Date.parse(deadline) <= Date.parse(created)) throw new CoreError('protocol');
  const actions = list(v.actions, item => {
    const a = object(item);
    if (!actionStatuses.includes(a.status as RunAction['status'])) throw new CoreError('protocol');
    const action: RunAction = { position: integer(a.position, 0), device_id: string(a.device_id), requested_on: boolean(a.requested_on),
      status: a.status as RunAction['status'], failure_code: a.failure_code === null ? null : string(a.failure_code), receipt: a.receipt === null ? null : decodeReceipt(a.receipt) };
    if (action.receipt && (action.receipt.house_id !== house || action.receipt.device_id !== action.device_id || action.receipt.requested_on !== action.requested_on || action.receipt.status !== action.status || Date.parse(action.receipt.expires_at) > Date.parse(deadline))) throw new CoreError('protocol');
    if (['queued', 'dispatched', 'applied', 'failed', 'timed_out'].includes(action.status) && !action.receipt) throw new CoreError('protocol');
    return action;
  });
  if (!actions.length || actions.length > 16 || actions.some((a, i) => a.position !== i) ||
    new Set(actions.flatMap(a => a.receipt ? [a.receipt.command_id] : [])).size !== actions.filter(a => a.receipt).length ||
    (v.status === 'succeeded' && actions.some(a => a.status !== 'applied'))) throw new CoreError('protocol');
  return { id: string(v.id), house_id: house, scene_id: string(v.scene_id), scene_revision: integer(v.scene_revision, 1), created_at: created, dispatch_deadline: deadline, status: v.status as SceneRun['status'], actions };
}
export function checkRun(previous: SceneRun, next: SceneRun) {
  for (const key of ['id', 'house_id', 'scene_id', 'scene_revision', 'created_at', 'dispatch_deadline'] as const) if (next[key] !== previous[key]) throw new CoreError('protocol');
  if (next.actions.length !== previous.actions.length) throw new CoreError('protocol');
  previous.actions.forEach((a, i) => {
    const b = next.actions[i]!;
    if (a.device_id !== b.device_id || a.requested_on !== b.requested_on || (a.receipt && (!b.receipt ||
      a.receipt.command_id !== b.receipt.command_id || a.receipt.correlation_id !== b.receipt.correlation_id || a.receipt.expires_at !== b.receipt.expires_at))) throw new CoreError('protocol');
  });
}
export interface SceneRuns {
  permissions(signal: AbortSignal): Promise<string[]>;
  create(scene: string, revision: number, key: string, signal: AbortSignal): Promise<SceneRun>;
  read(id: string, signal: AbortSignal, previous?: SceneRun): Promise<SceneRun>;
  dispatch(previous: SceneRun, position: number, signal: AbortSignal): Promise<SceneRun>;
}
export function createSceneRuns(session: CoreSession, house: string): SceneRuns {
  const path = `/v1/houses/${encodeURIComponent(house)}/scene-runs`;
  const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, house, signal)).permissions;
  const authorize = async (signal: AbortSignal) => {
    const grants = await permissions(signal);
    if (!['scene.read', 'scene.run', 'device.read', 'device.control'].every(p => grants.includes(p))) throw new CoreError('forbidden');
  };
  const decode = (value: unknown) => { const run = decodeSceneRun(value); if (run.house_id !== house) throw new CoreError('protocol'); return run; };
  return { permissions,
    async create(scene, revision, key, signal) {
      integer(revision, 1); await authorize(signal);
      const run = await session.command(path, { scene_id: scene, expected_revision: revision }, key, decode, signal, 201);
      if (run.scene_id !== scene || run.scene_revision !== revision) throw new CoreError('protocol');
      return run;
    },
    async read(id, signal, previous) {
      const run = await session.read(`${path}/${encodeURIComponent(id)}`, decode, signal);
      if (run.id !== id) throw new CoreError('protocol');
      if (previous) checkRun(previous, run);
      return run;
    },
    async dispatch(previous, position, signal) {
      await authorize(signal);
      if (!['ready', 'running'].includes(previous.status) || previous.actions[position]?.status !== 'ready' || previous.actions.slice(0, position).some(a => a.status !== 'applied')) throw new CoreError('conflict');
      const run = await session.command(`${path}/${encodeURIComponent(previous.id)}/actions/${position}/dispatch`, undefined, '', decode, signal);
      checkRun(previous, run); return run;
    },
  };
}
