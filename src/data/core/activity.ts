import type { HomeActivity, AutomationRule, HomeEvent } from '../../domain/activity';
import type { CoreSession } from './session';
import { boolean, decodeRevision, list, number, object, string } from './dtos';
import { CoreError } from './errors';

const operators: Record<string, string> = { eq: '=', neq: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤' };
function stateRule(value: unknown): string {
  const v = object(value);
  const operator = operators[string(v.operator)];
  if (v.type !== 'device_state' || !operator || !('value' in v)) throw new CoreError('protocol');
  return `${string(v.device_id)} · ${string(v.field)} ${operator} ${JSON.stringify(v.value)}`;
}
export function decodeAutomation(value: unknown): AutomationRule & { houseId: string } {
  const v = object(value);
  return { revision: decodeRevision(v.revision), id: string(v.id), houseId: string(v.house_id), name: string(v.name), enabled: boolean(v.enabled),
    trigger: stateRule(v.trigger),
    conditions: list(v.conditions, value => {
      const c = object(value);
      if (c.type !== 'time') return stateRule(c);
      const after = string(c.after), before = string(c.before);
      if (![after, before].every(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))) throw new CoreError('protocol');
      return `Время: ${after}–${before}`;
    }),
    actions: list(v.actions, value => {
      const a = object(value);
      if (a.type === 'delay') {
        const seconds = number(a.seconds);
        if (seconds <= 0 || seconds > 86400) throw new CoreError('protocol');
        return `Пауза: ${seconds} с`;
      }
      if (a.type !== 'device_state') throw new CoreError('protocol');
      return `${string(a.device_id)} · ${JSON.stringify(object(a.state))}`;
    }),
  };
}
export function decodeEvent(value: unknown): HomeEvent & { houseId: string | null } {
  const v = object(value), createdAt = string(v.created_at);
  if (!Number.isFinite(Date.parse(createdAt))) throw new CoreError('protocol');
  return { id: string(v.id), houseId: v.house_id === null ? null : string(v.house_id),
    type: string(v.event_type), entityId: v.entity_id === null ? null : string(v.entity_id), createdAt };
}
/** Reads are independent of the home snapshot: denied audit access must not hide rooms. */
export function createHomeActivity(session: CoreSession, houseId: string): HomeActivity {
  return {
    async automations(signal) {
      const rules = await session.read('/automations', value => list(value, decodeAutomation), signal);
      return rules.filter(rule => rule.houseId === houseId);
    },
    async events(signal) {
      const events = await session.read(`/events?house_id=${encodeURIComponent(houseId)}&limit=100`, value => list(value, decodeEvent), signal);
      // Do not surface global/security or another home's events, even on a malformed server scope.
      return events.filter(event => event.houseId === houseId);
    },
  };
}
