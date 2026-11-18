import { boolean, decodeDevice, decodeRevision, list, object, string, type CoreDevice } from './dtos';
import { decodeDurableWait, isDurableWait, validDurablePlan, type DurableWait } from './durable';
import { validName } from './definitions';
import { CoreError } from './errors';
import { readHousePermissions } from './permissions';
import type { CoreSession } from './session';

export type SceneStep = { type: 'device_state'; device_id: string; state: { on: boolean } } | DurableWait;
export interface EditableScene { id: string; houseId: string; name: string; revision: number | undefined; isDraft: boolean | undefined; plan: SceneStep[] | null }
export interface SceneEditing {
  permissions(signal: AbortSignal): Promise<string[]>;
  devices(signal: AbortSignal): Promise<CoreDevice[]>;
  read(id: string, signal: AbortSignal): Promise<EditableScene>;
  save(base: EditableScene, name: string, plan: SceneStep[], signal: AbortSignal): Promise<EditableScene>;
  duplicate(base: EditableScene, id: string, name: string, signal: AbortSignal): Promise<EditableScene>;
  activate(base: EditableScene, signal: AbortSignal): Promise<EditableScene>;
}
export const supportsSceneRelay = (d: CoreDevice) => d.type === 'relay' && d.capabilities.includes('on_off');
export function decodeScenePlan(value: unknown): SceneStep[] {
  const plan = list(value, entry => {
    const a = object(entry);
    if (a.type === 'durable_wait') return decodeDurableWait(a);
    const state = object(a.state);
    if (a.type !== 'device_state' || Object.keys(a).some(k => !['type', 'device_id', 'state'].includes(k)) || Object.keys(state).length !== 1) throw new CoreError('protocol');
    return { type: 'device_state' as const, device_id: string(a.device_id), state: { on: boolean(state.on) } };
  });
  if (!plan.length || plan.length > 16 || !validDurablePlan(plan)) throw new CoreError('protocol');
  return plan;
}
export function decodeEditableScene(value: unknown): EditableScene {
  const v = object(value); let plan: SceneStep[] | null = null;
  try {
    if (Object.keys(v).some(k => !['id', 'house_id', 'name', 'actions', 'revision', 'is_draft', 'created_at', 'updated_at'].includes(k))) throw new CoreError('protocol');
    plan = decodeScenePlan(v.actions);
  } catch { /* Preserve unknown/legacy definitions as read-only, never strip constraints. */ }
  return { id: string(v.id), houseId: string(v.house_id), name: string(v.name), revision: decodeRevision(v.revision), isDraft: v.is_draft === undefined ? undefined : boolean(v.is_draft), plan };
}
export function scenePlanErrors(name: string, plan: SceneStep[], devices: CoreDevice[]): string[] {
  const errors: string[] = [];
  if (!validName(name)) errors.push('Укажите название от 1 до 255 символов.');
  try { decodeScenePlan(plan); } catch { errors.push('Нужен поддерживаемый план: 1–16 шагов, паузы только между действиями реле.'); }
  const ids = new Set(devices.filter(supportsSceneRelay).map(d => d.id));
  if (plan.some(a => !isDurableWait(a) && !ids.has(a.device_id))) errors.push('Выберите доступное в этом доме реле с возможностью Вкл/Выкл. Неподдерживаемые устройства не преобразуются.');
  return errors;
}
const samePlan = (a: SceneStep[] | null, b: SceneStep[] | null) => JSON.stringify(a) === JSON.stringify(b);
export function createSceneEditing(session: CoreSession, house: string): SceneEditing {
  const path = (id: string) => `/scenes/${encodeURIComponent(id)}`;
  const decode = (id: string) => (value: unknown) => { const v = decodeEditableScene(value); if (v.id !== id) throw new CoreError('protocol'); if (v.houseId !== house) throw new CoreError('forbidden'); return v; };
  const read = (id: string, signal: AbortSignal) => session.read(path(id), decode(id), signal);
  const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, house, signal)).permissions;
  const devices = (signal: AbortSignal) => session.read(`/devices?house_id=${encodeURIComponent(house)}`, v => list(v, decodeDevice), signal);
  async function current(base: EditableScene, signal: AbortSignal) {
    if (!base.revision || base.isDraft === undefined || !base.plan) throw new CoreError('read-only');
    const grants = await permissions(signal);
    if (!['scene.read', 'scene.manage', 'device.read'].every(p => grants.includes(p))) throw new CoreError('forbidden');
    const value = await read(base.id, signal);
    if (value.revision !== base.revision || value.isDraft !== base.isDraft || value.name !== base.name || !samePlan(value.plan, base.plan)) throw new CoreError('conflict');
    return value;
  }
  async function verify(saved: EditableScene, expected: { id: string; name: string; plan: SceneStep[]; revision: number; isDraft: boolean }, signal: AbortSignal) {
    const matches = (v: EditableScene) => v.id === expected.id && v.houseId === house && v.name === expected.name && v.revision === expected.revision && v.isDraft === expected.isDraft && samePlan(v.plan, expected.plan);
    if (!matches(saved)) throw new CoreError('protocol');
    const back = await read(expected.id, signal);
    if (!matches(back)) throw new CoreError('conflict');
    return back;
  }
  return { permissions, devices, read,
    async save(base, name, plan, signal) {
      await current(base, signal);
      if (scenePlanErrors(name, plan, await devices(signal)).length) throw new CoreError('validation');
      const body = { name: name.trim(), actions: plan, expected_revision: base.revision };
      const saved = await session.definitionWrite(path(base.id), 'PATCH', body, 200, decode(base.id), signal);
      return verify(saved, { id: base.id, name: body.name, plan, revision: base.revision! + 1, isDraft: base.isDraft! }, signal);
    },
    async duplicate(base, id, name, signal) {
      await current(base, signal);
      if (!id || id === base.id || id.length > 64 || scenePlanErrors(name, base.plan!, await devices(signal)).length) throw new CoreError('validation');
      const saved = await session.definitionWrite(`${path(base.id)}/duplicate`, 'POST', { id, name: name.trim(), expected_revision: base.revision }, 201, decode(id), signal);
      // A retry/collision is always409; never infer ownership/success from equal content at this ID.
      return verify(saved, { id, name: name.trim(), plan: base.plan!, revision: 1, isDraft: true }, signal);
    },
    async activate(base, signal) {
      await current(base, signal);
      if (!base.isDraft) throw new CoreError('conflict');
      if (scenePlanErrors(base.name, base.plan!, await devices(signal)).length) throw new CoreError('validation');
      const saved = await session.definitionWrite(`${path(base.id)}/activate`, 'POST', { expected_revision: base.revision }, 200, decode(base.id), signal);
      return verify(saved, { id: base.id, name: base.name, plan: base.plan!, revision: base.revision! + 1, isDraft: false }, signal);
    },
  };
}
