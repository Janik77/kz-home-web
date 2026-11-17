import { boolean, decodeDevice, decodeRevision, list, object, string, type CoreDevice } from './dtos';
import { decodeAutomation } from './activity';
import { validName } from './definitions';
import { CoreError } from './errors';
import { readHousePermissions } from './permissions';
import { decodeReceipt, type Receipt } from './relay-control';
import type { AutomationRule } from '../../domain/activity';
import type { CoreSession } from './session';

export interface StateTest { type: 'device_state'; device_id: string; field: 'on'; operator: 'eq' | 'neq'; value: boolean }
export interface AutomationDraft { id: string; name: string; trigger: StateTest; conditions: StateTest[]; actions: { type: 'device_state'; device_id: string; state: { on: boolean } }[] }
export interface EditableAutomation extends AutomationRule { draft: AutomationDraft | null; houseId: string }
export interface AutomationCheck { automation_id: string; revision: number; eligible: boolean; conditions_match: boolean; issues: string[]; actions: { device_id: string; requested_on: boolean }[] }
const statuses = ['ready', 'running', 'succeeded', 'stopped', 'unknown', 'expired', 'partial', 'refused', 'skipped'] as const;
const actionStatuses = ['ready', 'waiting', 'dispatch_unknown', 'blocked', 'skipped', 'queued', 'dispatched', 'applied', 'failed', 'timed_out'] as const;
export interface AutomationRun { id: string; house_id: string; automation_id: string; automation_revision: number; status: typeof statuses[number]; execution_error: string | null; created_at: string; actions: { position: number; device_id: string; requested_on: boolean; status: typeof actionStatuses[number]; failure_code: string | null; receipt: Receipt | null }[] }
function revision(value: unknown) { const r = decodeRevision(value); if (!r) throw new CoreError('protocol'); return r; }
const nullable = (v: unknown) => v === null ? null : string(v);
function stateTest(value: unknown): StateTest {
  const v = object(value);
  if (v.type !== 'device_state' || v.field !== 'on' || !['eq', 'neq'].includes(String(v.operator))) throw new CoreError('protocol');
  return { type: 'device_state', device_id: string(v.device_id), field: 'on', operator: v.operator as 'eq' | 'neq', value: boolean(v.value) };
}
export function decodeEditableAutomation(value: unknown): EditableAutomation {
  const v = object(value), rule = decodeAutomation(v); let draft: AutomationDraft | null = null;
  try {
    draft = { id: rule.id, name: rule.name, trigger: stateTest(v.trigger), conditions: list(v.conditions, stateTest), actions: list(v.actions, value => {
      const a = object(value), s = object(a.state);
      if (a.type !== 'device_state' || Object.keys(s).length !== 1) throw new CoreError('protocol');
      return { type: 'device_state', device_id: string(a.device_id), state: { on: boolean(s.on) } };
    }) };
    if (draft.actions.length < 1 || draft.actions.length > 16 || draft.conditions.length > 50) draft = null;
  } catch { /* Older complex rules remain readable, never silently converted. */ }
  return { ...rule, draft };
}
export function automationErrors(draft: AutomationDraft, devices: CoreDevice[]): string[] {
  const ids = new Set(devices.filter(supportsRelay).map(d => d.id)), errors: string[] = [];
  if (!validName(draft.name)) errors.push('Укажите название до 255 символов.');
  if (![draft.trigger, ...draft.conditions].every(t => ids.has(t.device_id) && t.field === 'on' && ['eq', 'neq'].includes(t.operator) && typeof t.value === 'boolean')) errors.push('Выберите доступное реле ON/OFF для события и каждого условия.');
  if (draft.conditions.length > 50) errors.push('Допускается до 50 условий.');
  if (draft.actions.length < 1 || draft.actions.length > 16 || draft.actions.some(a => !ids.has(a.device_id) || typeof a.state.on !== 'boolean')) errors.push('Добавьте от 1 до 16 действий с доступными реле ON/OFF.');
  return errors;
}
export const supportsRelay = (d: CoreDevice) => d.type === 'relay' && d.capabilities.includes('on_off') && typeof d.state.on === 'boolean';
export function decodeAutomationRun(value: unknown): AutomationRun {
  const v = object(value), house = string(v.house_id), created = string(v.created_at);
  if (!statuses.includes(v.status as AutomationRun['status']) || !Number.isFinite(Date.parse(created))) throw new CoreError('protocol');
  const actions = list(v.actions, (item) => {
    const a = object(item);
    if (!Number.isSafeInteger(a.position) || !actionStatuses.includes(a.status as typeof actionStatuses[number])) throw new CoreError('protocol');
    const receipt = a.receipt === null ? null : decodeReceipt(a.receipt);
    const action = { position: a.position as number, device_id: string(a.device_id), requested_on: boolean(a.requested_on), status: a.status as typeof actionStatuses[number], failure_code: nullable(a.failure_code), receipt };
    if (receipt && (receipt.house_id !== house || receipt.device_id !== action.device_id || receipt.requested_on !== action.requested_on || receipt.status !== action.status)) throw new CoreError('protocol');
    if (['queued', 'dispatched', 'applied', 'failed', 'timed_out'].includes(action.status) && !receipt) throw new CoreError('protocol');
    return action;
  });
  if (actions.length > 16 || actions.some((a, i) => a.position !== i) || (v.status === 'succeeded' && (!actions.length || actions.some(a => a.status !== 'applied')))) throw new CoreError('protocol');
  return { id: string(v.id), house_id: house, automation_id: string(v.automation_id), automation_revision: revision(v.automation_revision), created_at: created, status: v.status as AutomationRun['status'], execution_error: nullable(v.execution_error), actions };
}
export interface Automations {
  permissions(signal: AbortSignal): Promise<string[]>;
  devices(signal: AbortSignal): Promise<CoreDevice[]>;
  read(id: string, signal: AbortSignal): Promise<EditableAutomation>;
  save(draft: AutomationDraft, expectedRevision: number | undefined, signal: AbortSignal): Promise<EditableAutomation>;
  toggle(id: string, enabled: boolean, expectedRevision: number, signal: AbortSignal): Promise<EditableAutomation>;
  check(id: string, signal: AbortSignal): Promise<AutomationCheck>;
  runs(id: string, signal: AbortSignal): Promise<AutomationRun[]>;
}
export function createAutomations(session: CoreSession, house: string): Automations {
  const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, house, signal)).permissions;
  const authorize = async (signal: AbortSignal) => { const grants = await permissions(signal); if (!['automation.read', 'automation.manage'].every(p => grants.includes(p))) throw new CoreError('forbidden'); };
  const path = (id: string) => `/automations/${encodeURIComponent(id)}`;
  const decode = (id: string) => (value: unknown) => { const rule = decodeEditableAutomation(value); if (rule.id !== id || rule.houseId !== house) throw new CoreError('protocol'); return rule; };
  const read = (id: string, signal: AbortSignal) => session.read(path(id), decode(id), signal);
  const devices = async (signal: AbortSignal) => session.read(`/devices?house_id=${encodeURIComponent(house)}`, v => list(v, decodeDevice), signal);
  return { permissions, read, devices,
    async save(draft, expectedRevision, signal) {
      await authorize(signal);
      if (automationErrors(draft, await devices(signal)).length) throw new CoreError('validation');
      if (expectedRevision !== undefined) {
        revision(expectedRevision);
        if ((await read(draft.id, signal)).revision !== expectedRevision) throw new CoreError('conflict');
      }
      const body = { name: draft.name.trim(), trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions, ...(expectedRevision === undefined ? { id: draft.id, house_id: house, enabled: false } : { expected_revision: expectedRevision }) };
      const written = await session.definitionWrite(expectedRevision === undefined ? '/automations' : path(draft.id), expectedRevision === undefined ? 'POST' : 'PATCH', body, expectedRevision === undefined ? 201 : 200, decode(draft.id), signal);
      const saved = await read(draft.id, signal);
      if (!saved.draft || saved.revision !== written.revision || saved.name !== body.name || JSON.stringify(saved.draft.trigger) !== JSON.stringify(draft.trigger) || JSON.stringify(saved.draft.conditions) !== JSON.stringify(draft.conditions) || JSON.stringify(saved.draft.actions) !== JSON.stringify(draft.actions)) throw new CoreError('conflict');
      return saved;
    },
    async toggle(id, enabled, expectedRevision, signal) {
      revision(expectedRevision); await authorize(signal);
      const written = await session.definitionWrite(path(id), 'PATCH', { enabled, expected_revision: expectedRevision }, 200, decode(id), signal);
      const saved = await read(id, signal);
      if (saved.enabled !== enabled || saved.revision !== written.revision) throw new CoreError('conflict');
      return saved;
    },
    async check(id, signal) {
      return session.definitionWrite(`${path(id)}/dry-run`, 'POST', {}, 200, value => {
        const v = object(value); if (string(v.automation_id) !== id) throw new CoreError('protocol');
        return { automation_id: id, revision: revision(v.revision), eligible: boolean(v.eligible), conditions_match: boolean(v.conditions_match), issues: list(v.issues, string), actions: list(v.actions, a => { const row = object(a); return { device_id: string(row.device_id), requested_on: boolean(row.requested_on) }; }) };
      }, signal);
    },
    async runs(id, signal) {
      return session.read(`${path(id)}/runs`, v => list(v, item => { const run = decodeAutomationRun(item); if (run.automation_id !== id || run.house_id !== house) throw new CoreError('protocol'); return run; }), signal);
    },
  };
}
