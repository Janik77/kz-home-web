import { validateDurableRun, decodeWaitRunAction, decodeDurableRunFields, type WaitRunAction, type DurableRunFields } from './durable';
import { decodeDurableWait, isDurableWait, validDurablePlan, type DurableWait } from './durable';
import { decodeSchedule, validSchedule, type ScheduleTrigger } from './schedules';
import { isNumericField, validNumericTest, type NumericTrigger, type NumericCondition } from './numeric';
import { boolean, decodeDevice, decodeRevision, list, object, string, type CoreDevice } from './dtos';
import { decodeAutomation } from './activity';
import { validName } from './definitions';
import { CoreError } from './errors';
import { readHousePermissions } from './permissions';
import { decodeReceipt, type Receipt } from './relay-control';
import type { AutomationRule } from '../../domain/activity';
import type { CoreSession } from './session';

export interface StateTest { type: 'device_state'; device_id: string; field: 'on'; operator: 'eq' | 'neq'; value: boolean }
export type ConditionTest = StateTest | NumericCondition;
export type DeviceTrigger = StateTest | NumericTrigger;
export type TriggerTest = DeviceTrigger | ScheduleTrigger;
export interface AutomationDraft { id: string; name: string; trigger: TriggerTest; conditions: ConditionTest[]; actions: ({ type: 'device_state'; device_id: string; state: { on: boolean } } | DurableWait)[] }
export interface EditableAutomation extends AutomationRule { draft: AutomationDraft | null; houseId: string }
export interface AutomationCheck { automation_id: string; revision: number; eligible: boolean; conditions_match: boolean; issues: string[]; actions: { device_id: string; requested_on: boolean }[] }
const statuses = ['ready', 'running', 'succeeded', 'stopped', 'unknown', 'expired', 'partial', 'refused', 'skipped', 'waiting', 'cancelled'] as const;
const actionStatuses = ['cancelled', 'expired', 'ready', 'waiting', 'dispatch_unknown', 'blocked', 'skipped', 'queued', 'dispatched', 'applied', 'failed', 'timed_out'] as const;
export interface AutomationRun extends DurableRunFields { id: string; house_id: string; automation_id: string; automation_revision: number; status: typeof statuses[number]; execution_error: string | null; created_at: string; actions: ({ position: number; device_id: string; requested_on: boolean; status: typeof actionStatuses[number]; failure_code: string | null; receipt: Receipt | null } | WaitRunAction)[] }
function revision(value: unknown) { const r = decodeRevision(value); if (!r) throw new CoreError('protocol'); return r; }
const nullable = (v: unknown) => v === null ? null : string(v);
function stateTest(value: unknown): StateTest {
  const v = { ...object(value) };
  if (v.hysteresis === null) delete v.hysteresis;
  if (Object.keys(v).some(k => !['type', 'device_id', 'field', 'operator', 'value'].includes(k))) throw new CoreError('protocol');
  if (v.type !== 'device_state' || v.field !== 'on' || !['eq', 'neq'].includes(String(v.operator))) throw new CoreError('protocol');
  return { type: 'device_state', device_id: string(v.device_id), field: 'on', operator: v.operator as 'eq' | 'neq', value: boolean(v.value) };
}
function numericTest(value: unknown, trigger: true): NumericTrigger;
function numericTest(value: unknown, trigger: false): NumericCondition;
function numericTest(value: unknown, trigger: boolean): NumericTrigger | NumericCondition {
  const v = { ...object(value) };
  if (!trigger && v.hysteresis === null) delete v.hysteresis;
  const allowed = ['type', 'device_id', 'field', 'operator', 'value', ...(trigger ? ['hysteresis'] : [])];
  if (v.type !== (trigger ? 'numeric_threshold' : 'numeric_state') || typeof v.field !== 'string' || !isNumericField(v.field) || Object.keys(v).some(k => !allowed.includes(k))) throw new CoreError('protocol');
  const result = { ...v, device_id: string(v.device_id) } as unknown as NumericTrigger | NumericCondition;
  if (!validNumericTest(result)) throw new CoreError('protocol');
  return result;
}
export function decodeEditableAutomation(value: unknown): EditableAutomation {
  const v = object(value), rule = decodeAutomation(v); let draft: AutomationDraft | null = null;
  try {
    draft = { id: rule.id, name: rule.name, trigger: object(v.trigger).type === 'schedule' ? decodeSchedule(v.trigger) : object(v.trigger).type === 'numeric_threshold' ? numericTest(v.trigger, true) : stateTest(v.trigger), conditions: list(v.conditions, c => object(c).type === 'numeric_state' ? numericTest(c, false) : stateTest(c)), actions: list(v.actions, value => {
      const a = object(value); if(a.type === 'durable_wait') return decodeDurableWait(a); const s = object(a.state);
      if (a.type !== 'device_state' || Object.keys(s).length !== 1 || (Array.isArray(v.actions) && v.actions.some(step => object(step).type === 'durable_wait') && Object.keys(a).some(key => !['type','device_id','state'].includes(key)))) throw new CoreError('protocol');
      return { type: 'device_state', device_id: string(a.device_id), state: { on: boolean(s.on) } };
    }) };
    if (draft.actions.length < 1 || draft.actions.length > 16 || !validDurablePlan(draft.actions) || draft.conditions.length > 50) draft = null;
  } catch { /* Older complex rules remain readable, never silently converted. */ }
  return { ...rule, draft };
}
export function automationErrors(draft: AutomationDraft, devices: CoreDevice[]): string[] {
  const ids = new Set(devices.filter(supportsRelay).map(d => d.id)), errors: string[] = [];
  if (!validName(draft.name)) errors.push('Укажите название до 255 символов.');
  if (![draft.trigger, ...draft.conditions].every(t => t.type === 'schedule' ? true : t.type === 'device_state' ? ids.has(t.device_id) && t.field === 'on' && ['eq', 'neq'].includes(t.operator) && typeof t.value === 'boolean' : validNumericTest(t) && devices.some(d => d.id === t.device_id && d.capabilities.includes(t.field)))) errors.push('Выберите поддерживаемое устройство и корректное значение для события и каждого условия. Порог возврата должен оставаться в диапазоне датчика.');
  if (draft.trigger.type === 'schedule' && !validSchedule(draft.trigger)) errors.push('Выберите время HH:MM и хотя бы один день недели.');
  if (draft.conditions.length > 50) errors.push('Допускается до 50 условий.');
  if (draft.actions.length < 1 || draft.actions.length > 16 || !validDurablePlan(draft.actions) || draft.actions.some(a => !isDurableWait(a) && (!ids.has(a.device_id) || typeof a.state.on !== 'boolean'))) errors.push('Добавьте от 1 до 16 действий с доступными реле ON/OFF.');
  return errors;
}
export const supportsRelay = (d: CoreDevice) => d.type === 'relay' && d.capabilities.includes('on_off') && typeof d.state.on === 'boolean';
export function decodeAutomationRun(value: unknown): AutomationRun {
  const v = object(value), house = string(v.house_id), created = string(v.created_at);
  if (!statuses.includes(v.status as AutomationRun['status']) || !Number.isFinite(Date.parse(created))) throw new CoreError('protocol');
  const actions = list(v.actions, (item) => {
    const a = object(item);
    if(a.type === 'durable_wait')return decodeWaitRunAction(a);
    if (!Number.isSafeInteger(a.position) || !actionStatuses.includes(a.status as typeof actionStatuses[number])) throw new CoreError('protocol');
    const receipt = a.receipt === null ? null : decodeReceipt(a.receipt);
    const action = { position: a.position as number, device_id: string(a.device_id), requested_on: boolean(a.requested_on), status: a.status as typeof actionStatuses[number], failure_code: nullable(a.failure_code), receipt };
    if (receipt && (receipt.house_id !== house || receipt.device_id !== action.device_id || receipt.requested_on !== action.requested_on || receipt.status !== action.status)) throw new CoreError('protocol');
    if (['queued', 'dispatched', 'applied', 'failed', 'timed_out'].includes(action.status) && !receipt) throw new CoreError('protocol');
    return action;
  });
  const durable = decodeDurableRunFields(v); validateDurableRun(v,actions,durable); const hasWait = actions.some(a => 'type' in a);
  if(hasWait && !durable.plan_deadline || !hasWait && durable.plan_deadline || (v.status==='waiting'&&(!hasWait||!durable.wait_due_at)) || (v.status==='cancelled'&&(!hasWait||!durable.cancelled_at))) throw new CoreError('protocol');
  if (actions.length > 16 || actions.some((a, i) => a.position !== i) ||
    new Set(actions.flatMap(a => a.receipt ? [a.receipt.command_id] : [])).size !== actions.filter(a => a.receipt).length ||
    (v.status === 'succeeded' && (!actions.length || actions.some(a => a.status !== 'applied' && a.status !== 'completed'))) ||
    (v.status === 'partial' && (!actions.some(a => a.status === 'applied') || actions.every(a => a.status === 'applied' || a.status === 'completed'))) ||
    (v.status === 'refused' && actions.some(a => a.status === 'applied'))) throw new CoreError('protocol');
  return { ...decodeDurableRunFields(v), id: string(v.id), house_id: house, automation_id: string(v.automation_id), automation_revision: revision(v.automation_revision), created_at: created, status: v.status as AutomationRun['status'], execution_error: nullable(v.execution_error), actions };
}
export interface Automations {
  permissions(signal: AbortSignal): Promise<string[]>;
  devices(signal: AbortSignal): Promise<CoreDevice[]>;
  read(id: string, signal: AbortSignal): Promise<EditableAutomation>;
  save(draft: AutomationDraft, expectedRevision: number | undefined, signal: AbortSignal): Promise<EditableAutomation>;
  toggle(id: string, enabled: boolean, expectedRevision: number, signal: AbortSignal): Promise<EditableAutomation>;
  check(id: string, signal: AbortSignal): Promise<AutomationCheck>;
  cancelRun?(id: string, run: AutomationRun, signal: AbortSignal): Promise<AutomationRun>;
  runs(id: string, signal: AbortSignal): Promise<AutomationRun[]>;
}
export function createAutomations(session: CoreSession, house: string): Automations {
  const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, house, signal)).permissions;
  const authorize = async (signal: AbortSignal) => { const grants = await permissions(signal); if (!['automation.read', 'automation.manage'].every(p => grants.includes(p))) throw new CoreError('forbidden'); };
  const path = (id: string) => `/automations/${encodeURIComponent(id)}`;
  const decode = (id: string) => (value: unknown) => { const rule = decodeEditableAutomation(value); if (rule.id !== id || rule.houseId !== house) throw new CoreError('protocol'); return rule; };
  const read = (id: string, signal: AbortSignal) => session.read(path(id), decode(id), signal);
  // Older Core exposes PATCH but executes automations without receipts. Never
  // activate or alter a live definition before the confirmed executor API answers.
  const verifyExecutor = async (id: string, expected: number, signal: AbortSignal) => {
    await session.definitionWrite(`${path(id)}/dry-run`, 'POST', {}, 200, value => {
      const v = object(value);
      if (string(v.automation_id) !== id || revision(v.revision) !== expected) throw new CoreError('conflict');
      boolean(v.eligible); boolean(v.conditions_match); list(v.issues, string);
    }, signal);
  };
  const devices = async (signal: AbortSignal) => session.read(`/devices?house_id=${encodeURIComponent(house)}`, v => list(v, decodeDevice), signal);
  return { permissions, read, devices,
    async save(draft, expectedRevision, signal) {
      await authorize(signal);
      if (automationErrors(draft, await devices(signal)).length) throw new CoreError('validation');
      if (expectedRevision !== undefined) {
        revision(expectedRevision);
        if ((await read(draft.id, signal)).revision !== expectedRevision) throw new CoreError('conflict');
        await verifyExecutor(draft.id, expectedRevision, signal);
      }
      const body = { name: draft.name.trim(), trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions, ...(expectedRevision === undefined ? { id: draft.id, house_id: house, enabled: false } : { expected_revision: expectedRevision }) };
      const written = await session.definitionWrite(expectedRevision === undefined ? '/automations' : path(draft.id), expectedRevision === undefined ? 'POST' : 'PATCH', body, expectedRevision === undefined ? 201 : 200, decode(draft.id), signal);
      if (expectedRevision !== undefined && written.revision !== expectedRevision + 1) throw new CoreError('protocol');
      if (expectedRevision === undefined && written.enabled) throw new CoreError('protocol');
      const saved = await read(draft.id, signal);
      if (!saved.draft || saved.revision !== written.revision || saved.name !== body.name || JSON.stringify(saved.draft.trigger) !== JSON.stringify(draft.trigger) || JSON.stringify(saved.draft.conditions) !== JSON.stringify(draft.conditions) || JSON.stringify(saved.draft.actions) !== JSON.stringify(draft.actions)) throw new CoreError('conflict');
      return saved;
    },
    async toggle(id, enabled, expectedRevision, signal) {
      revision(expectedRevision); await authorize(signal);
      if (enabled) await verifyExecutor(id, expectedRevision, signal);
      const written = await session.definitionWrite(path(id), 'PATCH', { enabled, expected_revision: expectedRevision }, 200, decode(id), signal);
      if (written.revision !== expectedRevision + 1) throw new CoreError('protocol');
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
    async cancelRun(id, run, signal) {
      await authorize(signal); if(!(await permissions(signal)).includes('device.control')||run.status!=='waiting'||!run.plan_deadline)throw new CoreError('forbidden');
      return session.definitionWrite(`${path(id)}/runs/${encodeURIComponent(run.id)}/cancel`,'POST',{},200,value=>{const next=decodeAutomationRun(value);if(next.id!==run.id||next.house_id!==house||next.automation_id!==id||next.plan_deadline!==run.plan_deadline||next.automation_revision!==run.automation_revision||next.created_at!==run.created_at||next.actions.length!==run.actions.length)throw new CoreError('protocol');run.actions.forEach((a,i)=>{const b=next.actions[i]!;if(a.device_id!==b.device_id||a.requested_on!==b.requested_on||('type' in a)!==('type' in b)||('type' in a&&'type' in b&&(a.seconds!==b.seconds||a.due_at!==b.due_at||a.resume_deadline!==b.resume_deadline))||(a.receipt&&(!b.receipt||a.receipt.command_id!==b.receipt.command_id||a.receipt.correlation_id!==b.receipt.correlation_id||a.receipt.expires_at!==b.receipt.expires_at)))throw new CoreError('protocol');});return next;},signal);
    },
    async runs(id, signal) {
      return session.read(`${path(id)}/runs`, v => list(v, item => { const run = decodeAutomationRun(item); if (run.automation_id !== id || run.house_id !== house) throw new CoreError('protocol'); return run; }), signal);
    },
  };
}
