import type { CoreSession } from './session';
import { decodeScene, object, string } from './dtos';
import { readHousePermissions } from './permissions';
import { CoreError } from './errors';

export type DefinitionKind = 'scenes' | 'automations';
export interface SceneDraft { id: string; name: string; actions: { deviceId: string; on: boolean }[] }
export interface Definitions {
  permissions(signal: AbortSignal): Promise<string[]>;
  createScene(draft: SceneDraft, signal: AbortSignal): Promise<void>;
  rename(kind: DefinitionKind, id: string, previousName: string, name: string, signal: AbortSignal): Promise<void>;
}
export function validName(name: string) { return name.trim().length > 0 && Array.from(name.trim()).length <= 255; }
export function definitionError(error: unknown): string {
  if (error instanceof CoreError) {
    if (error.kind === 'forbidden') return 'Нет прав на изменение. Черновик сохранён в форме.';
    if (error.kind === 'conflict') return 'Запись изменилась или уже существует. Обновите список перед повтором; черновик остаётся в форме.';
    if (error.kind === 'validation') return 'Проверьте название и действия. Core не принял изменения.';
  }
  return 'Сохранение не подтверждено. Проверьте подключение и обновите список перед повтором. Черновик остаётся в форме.';
}
export function createDefinitions(session: CoreSession, houseId: string): Definitions {
  const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, houseId, signal)).permissions;
  const authorize = async (kind: DefinitionKind, signal: AbortSignal) => {
    const grants = await permissions(signal), prefix = kind === 'scenes' ? 'scene' : 'automation';
    if (!grants.includes(`${prefix}.manage`) || !grants.includes(`${prefix}.read`)) throw new CoreError('forbidden');
  };
  const decode = (id: string) => (value: unknown) => {
    const v = object(value);
    if (string(v.house_id) !== houseId || string(v.id) !== id) throw new CoreError('protocol');
    return { name: string(v.name) };
  };
  return { permissions,
    async createScene(draft, signal) {
      if (!validName(draft.name) || !draft.id || draft.id.length > 64 || !draft.actions.length || draft.actions.length > 100
        || draft.actions.some(a => !a.deviceId || typeof a.on !== 'boolean')) throw new CoreError('validation');
      await authorize('scenes', signal);
      const body = { id: draft.id, house_id: houseId, name: draft.name.trim(),
        actions: draft.actions.map(a => ({ type: 'device_state', device_id: a.deviceId, state: { on: a.on } })) };
      const path = `/scenes/${encodeURIComponent(draft.id)}`;
      await session.definitionWrite('/scenes', 'POST', body, 201, decode(draft.id), signal);
      const saved = await session.read(path, decodeScene, signal);
      if (saved.id !== draft.id || saved.house_id !== houseId || saved.name !== body.name || JSON.stringify(saved.actions) !== JSON.stringify(body.actions)) throw new CoreError('conflict');
    },
    async rename(kind, id, previousName, name, signal) {
      if (!validName(name)) throw new CoreError('validation');
      await authorize(kind, signal);
      const path = `/${kind}/${encodeURIComponent(id)}`, parse = decode(id);
      const current = await session.read(path, parse, signal);
      if (current.name !== previousName) throw new CoreError('conflict');
      // Minimal PATCH preserves actions, trigger, conditions, enabled and unknown fields.
      await session.definitionWrite(path, 'PATCH', { name: name.trim() }, 200, parse, signal);
      const saved = await session.read(path, parse, signal);
      if (saved.name !== name.trim()) throw new CoreError('conflict');
    },
  };
}
