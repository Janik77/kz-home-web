import { expect, it, vi } from 'vitest';
import { createHomeActivity, decodeAutomation, decodeEvent } from './activity';
import { createServices } from '../create-services';
import { coreResponses } from '../../test/core-fixtures';

const rule = { id: 'rule', house_id: 'house-a', name: 'Свет при движении', enabled: false,
  trigger: { type: 'device_state', device_id: 'motion', field: 'motion', operator: 'eq', value: true },
  conditions: [{ type: 'time', after: '18:00', before: '23:00' }],
  actions: [{ type: 'device_state', device_id: 'relay', state: { on: true } }, { type: 'delay', seconds: 20 }] };
const event = { id: 'event', house_id: 'house-a', event_type: 'command_failed', entity_id: 'relay', created_at: '2026-11-12T12:00:00Z', payload: { private: 'must not expose' } };

it('decodes false enabled, conditions and ordered actions without guessing execution', () => {
  expect(decodeAutomation(rule)).toMatchObject({ enabled: false, trigger: 'motion · motion = true', conditions: ['Время: 18:00–23:00'], actions: ['relay · {"on":true}', 'Пауза: 20 с'] });
  expect(decodeAutomation(rule)).not.toHaveProperty('applied');
  expect(decodeEvent(event)).not.toHaveProperty('payload');
});
it.each([
  { ...rule, enabled: 'false' },
  { ...rule, trigger: { ...rule.trigger, operator: 'execute' } },
  { ...rule, conditions: [{ type: 'time', after: '99:99', before: '23:00' }] },
  { ...rule, actions: [{ type: 'delay', seconds: -1 }] },
  { ...rule, actions: [{ type: 'unknown' }] },
])('rejects incompatible automation responses', invalid => {
  expect(() => decodeAutomation(invalid)).toThrow();
});
it('rejects invalid event dates', () => {
  expect(() => decodeEvent({ ...event, created_at: 'yesterday' })).toThrow();
});
it('reads only supported routes, scopes both lists and propagates abort signals', async () => {
  const fetcher = vi.fn<typeof fetch>(async url => {
    const path = String(url).replace('/core-api', '');
    if (path === '/automations') return Response.json([rule, { ...rule, house_id: 'other' }]);
    if (path === '/events?house_id=house-a&limit=100') return Response.json([event, { ...event, house_id: 'other' }, { ...event, house_id: null }]);
    return Response.json(coreResponses[path]);
  });
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher);
  if (services.mode !== 'core') throw new Error('Core required');
  await services.session.login('homeowner@example.test', 'test-input');
  const activity = createHomeActivity(services.session, 'house-a');
  expect(await activity.automations()).toHaveLength(1);
  expect(await activity.events()).toHaveLength(1);
  const controller = new AbortController(); controller.abort();
  const calls = fetcher.mock.calls.length;
  await expect(activity.events(controller.signal)).rejects.toHaveProperty('name', 'AbortError');
  expect(fetcher).toHaveBeenCalledTimes(calls);
  expect(fetcher.mock.calls.filter(([, o]) => o?.method !== 'GET').map(([url]) => url)).toEqual(['/core-api/auth/login']);
});
it('keeps permission failures explicit instead of returning an empty list', async () => {
  const fetcher = vi.fn<typeof fetch>(async url => String(url).endsWith('/automations') ? new Response(null, { status: 403 }) : Response.json(coreResponses[String(url).replace('/core-api', '')]));
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher);
  if (services.mode !== 'core') throw new Error('Core required');
  await services.session.login('homeowner@example.test', 'test-input');
  await expect(createHomeActivity(services.session, 'house-a').automations()).rejects.toMatchObject({ kind: 'forbidden' });
  expect(await services.repositoryForHouse('house-a').getHome()).toHaveProperty('house.id', 'house-a');
});
