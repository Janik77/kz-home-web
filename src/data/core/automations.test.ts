import { expect, it, vi } from 'vitest';
import { createServices } from '../create-services';
import { coreResponses } from '../../test/core-fixtures';
import { automationErrors, decodeAutomationRun, decodeEditableAutomation, type AutomationDraft } from './automations';

const draft: AutomationDraft = { id: 'rule-a', name: 'Реле', trigger: { type: 'device_state', device_id: 'relay-a', field: 'on', operator: 'eq', value: true }, conditions: [], actions: [{ type: 'device_state', device_id: 'relay-a', state: { on: false } }] };
const device = { id: 'relay-a', name: 'Реле', room_id: 'room-a', type: 'relay', capabilities: ['on_off'], state: { on: false }, online: true, updated_at: '2026-11-17T12:00:00Z' };
const record = { ...draft, house_id: 'house-a', enabled: false, revision: 1 };
async function setup(options: { grants?: string[]; status?: number; foreign?: boolean; changed?: boolean; readbackFailure?: boolean; oldCore?: boolean } = {}) {
  let saved = { ...record }, wrote = false; const writes: { path: string; body: Record<string, unknown> }[] = [];
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url).replace('/core-api', '');
    if (path.endsWith('/me/permissions')) return Response.json({ house_id: 'house-a', permissions: options.grants ?? ['automation.read', 'automation.manage'] });
    if (path === '/devices?house_id=house-a') return Response.json([device]);
    if (path === '/automations' || path === '/automations/rule-a') {
      if (init?.method === 'POST' || init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body)); writes.push({ path, body }); wrote = true;
        if (options.status) return new Response(null, { status: options.status });
        const responseBody = { ...body }; delete responseBody.expected_revision;
        saved = { ...saved, ...responseBody, revision: saved.revision + 1 };
        return Response.json(saved, { status: init.method === 'POST' ? 201 : 200 });
      }
      if (wrote && options.readbackFailure) return new Response(null, { status: 503 });
      return Response.json({ ...saved, ...(options.foreign ? { house_id: 'other' } : {}), ...(options.changed && !wrote ? { revision: 3 } : {}) });
    }
    if (path.endsWith('/dry-run')) { if(options.oldCore) return new Response(null, {status:404}); return Response.json({ automation_id: 'rule-a', revision: 1, eligible: false, conditions_match: true, issues: ['rule_disabled'], actions: [{ device_id: 'relay-a', requested_on: false }] }); }
    return Response.json(coreResponses[path]);
  });
  const services = createServices({ mode: 'core', apiUrl: '/core-api' }, fetcher); if (services.mode !== 'core') throw Error();
  await services.session.login('a', 'b');
  return { service: services.repositoryForHouse('house-a').automations!, writes, fetcher };
}
it('creates a disabled rule, scoped to house and verifies readback without executing', async () => {
  const t = await setup(); await t.service.save(draft, undefined, new AbortController().signal);
  expect(t.writes).toEqual([{ path: '/automations', body: { ...draft, house_id: 'house-a', enabled: false } }]);
  expect(t.fetcher.mock.calls.some(([url]) => /execute|commands|\/run$/.test(String(url)))).toBe(false);
});
it('edits whole definition with captured revision but never overwrites enabled or house', async () => {
  const t = await setup(); await t.service.save({ ...draft, name: 'Новое' }, 1, new AbortController().signal);
  expect(t.writes[0]?.body).toEqual({ name: 'Новое', trigger: draft.trigger, conditions: [], actions: draft.actions, expected_revision: 1 });
});
it.each([{ grants: [] }, { grants: ['automation.manage'] }, { foreign: true }, { changed: true }])('rejects unsafe preflight %j before a mutation', async options => {
  const t = await setup(options); await expect(t.service.save(draft, 1, new AbortController().signal)).rejects.toBeDefined(); expect(t.writes).toHaveLength(0);
});
it.each([401, 403, 409, 422, 503])('never replays an ambiguous save after %s', async status => {
  const t = await setup({ status }); await expect(t.service.save(draft, 1, new AbortController().signal)).rejects.toBeDefined(); expect(t.writes).toHaveLength(1);
});
it('does not claim success without readback', async () => {
  const t = await setup({ readbackFailure: true }); await expect(t.service.save(draft, 1, new AbortController().signal)).rejects.toBeDefined(); expect(t.writes).toHaveLength(1);
});
it('enables explicitly with optimistic revision and no legacy enable/run routes', async () => {
  const t = await setup(); await t.service.toggle('rule-a', true, 1, new AbortController().signal);
  expect(t.writes).toEqual([{ path: '/automations/rule-a', body: { enabled: true, expected_revision: 1 } }]);
});
it('dry-run only calls the no-command endpoint and retains disabled/conditions distinction', async () => {
  const t = await setup(); const check = await t.service.check('rule-a', new AbortController().signal);
  expect(check.conditions_match).toBe(true); expect(check.eligible).toBe(false);
  expect(t.writes).toEqual([]); expect(t.fetcher.mock.calls.filter(([url]) => String(url).endsWith('/dry-run'))).toHaveLength(1);
});
it('keeps unsupported legacy rules readable but not silently editable', () => {
  expect(decodeEditableAutomation(record).draft).toEqual(draft);
  expect(decodeEditableAutomation({ ...record, actions: [{ type: 'delay', seconds: 1 }] }).draft).toBeNull();
  expect(decodeEditableAutomation({ ...record, trigger: { ...draft.trigger, field: 'temperature', value: 25 } }).draft).toBeNull();
});
it('only offers actual relay capabilities; offline definitions allowed but runtime checks remain server-side', () => {
  expect(automationErrors(draft, [device])).toEqual([]);
  expect(automationErrors(draft, [{ ...device, online: false }])).toEqual([]);
  expect(automationErrors(draft, [{ ...device, capabilities: [] }])).not.toEqual([]);
  expect(automationErrors({ ...draft, actions: Array(17).fill(draft.actions[0]) }, [device])).not.toEqual([]);
});
it('rejects false success and foreign receipts, preserving unknown results', () => {
  const run = { id: 'run-a', house_id: 'house-a', automation_id: 'rule-a', automation_revision: 1, status: 'unknown', execution_error: 'restart', created_at: '2026-11-17T12:00:00Z', actions: [{ position: 0, device_id: 'relay-a', requested_on: false, status: 'dispatch_unknown', failure_code: null, receipt: null }] };
  expect(decodeAutomationRun(run).status).toBe('unknown');
  expect(() => decodeAutomationRun({ ...run, status: 'succeeded' })).toThrow();
  expect(() => decodeAutomationRun({ ...run, actions: [{ ...run.actions[0], status: 'applied' }] })).toThrow();
});

it('old Core cannot activate or edit rules via the legacy unconfirmed executor', async () => {
  const t = await setup({ oldCore: true });
  await expect(t.service.toggle('rule-a', true, 1, new AbortController().signal)).rejects.toBeDefined();
  await expect(t.service.save(draft, 1, new AbortController().signal)).rejects.toBeDefined();
  expect(t.writes).toHaveLength(0);
  // Disabling remains a safe operation even during rollback to old Core.
  await t.service.toggle('rule-a', false, 1, new AbortController().signal);
  expect(t.writes).toHaveLength(1); expect(t.writes[0]?.body.enabled).toBe(false);
});

it('roundtrips ordered durable automation steps with revision and without commands',async()=>{
 const t=await setup();const next:AutomationDraft={...draft,actions:[{type:'device_state',device_id:'relay-a',state:{on:true}},{type:'durable_wait',seconds:8},...draft.actions]};
 const saved=await t.service.save(next,1,new AbortController().signal);expect(saved.draft?.actions).toEqual(next.actions);expect(t.writes[0]?.body).toMatchObject({actions:next.actions,expected_revision:1});expect(t.fetcher.mock.calls.some(([url])=>/execute|commands|\/run$/.test(String(url)))).toBe(false);
});
it('copy returns a distinct disabled rule, checks readback, never toggles or executes',async()=>{
 const writes:unknown[]=[];let copy:unknown;
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{const path=String(url).replace('/core-api','');
 if(path.endsWith('/me/permissions'))return Response.json({house_id:'house-a',permissions:['automation.read','automation.manage']});
 if(path==='/automations/rule-a')return Response.json({...record,enabled:true});
 if(path==='/automations/rule-a/duplicate'){const body=JSON.parse(String(init?.body));writes.push(body);copy={...record,id:body.id,name:body.name,enabled:false,revision:1};return Response.json(copy,{status:201});}
 if(path==='/automations/copy')return Response.json(copy);
 return Response.json(coreResponses[path]);});
 const s=createServices({mode:'core',apiUrl:'/core-api'},fetcher);if(s.mode!=='core')throw Error();await s.session.login('a','b');const api=s.repositoryForHouse('house-a').automations!,sig=new AbortController().signal;
 const saved=await api.duplicate!(await api.read('rule-a',sig),'copy','Копия',sig);expect(saved).toMatchObject({id:'copy',enabled:false,revision:1});expect(writes).toEqual([{id:'copy',name:'Копия',expected_revision:1}]);expect(fetcher.mock.calls.some(([u])=>/execute|commands|enable|dry-run/.test(String(u)))).toBe(false);
});
it.each([{future_constraint:true},{actions:[{...draft.actions[0],future_constraint:true}]}])('never strips future constraints into an editable/copyable rule %j',extra=>{expect(decodeEditableAutomation({...record,...extra}).draft).toBeNull();});
