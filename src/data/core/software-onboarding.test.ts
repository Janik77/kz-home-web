import { expect, it, vi } from 'vitest';
import { createServices } from '../create-services';
import { coreDevice, coreResponses } from '../../test/core-fixtures';

const page = '/v1/houses/house-a/software-device-candidates';
const draft = {id:'pilot-relay', type:'relay' as const, roomId:'room-a', name:' Свет '};
const saved = { ...coreDevice, id: draft.id, type: draft.type, room_id: draft.roomId, name: 'Свет', state: {}, online: false };
const signal = () => new AbortController().signal;
async function setup({listStatus=200, loss=false, mismatch=false, committed=true}={}) {
  const writes: unknown[] = [];
  let bound = false;
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = String(url).replace('/core-api', '');
    if (path === page) return listStatus === 200 ? Response.json(bound ? [] : [{device_id: draft.id, device_type: draft.type}])
      : new Response(null, {status:listStatus});
    if (path === page + '/pilot-relay/claim' && init?.method === 'POST') {
      writes.push(JSON.parse(String(init.body))); bound = committed;
      if (loss) throw new TypeError('response lost');
      return Response.json(mismatch ? {...saved, room_id:'foreign'} : saved, {status:201});
    }
    if (path === '/devices?house_id=house-a') return Response.json(bound ? [saved] : []);
    return Response.json(coreResponses[path]);
  });
  const services = createServices({mode:'core', apiUrl:'/core-api'}, fetcher);
  if (services.mode !== 'core') throw Error();
  await services.session.login('a','b');
  return { api: services.repositoryForHouse('house-a').softwareOnboarding!, writes, fetcher };
}
it('claims only name and room with the scoped software endpoint and accepts no synthetic state', async () => {
  const t = await setup();
  expect(await t.api.candidates(signal())).toEqual([{id:draft.id, type:draft.type}]);
  expect(await t.api.claim(draft, signal())).toMatchObject({id:draft.id, state:{}, online:false});
  expect(t.writes).toEqual([{room_id:'room-a', name:'Свет'}]);
});
it.each([[404,'not-found'],[403,'forbidden']])('keeps unsupported/denied capability as %i', async (status,kind) => {
  const t = await setup({listStatus:Number(status)});
  await expect(t.api.candidates(signal())).rejects.toMatchObject({kind});
  expect(t.writes).toEqual([]);
});
it.each([true,false])('reconciles lost HTTP receipt with reads only (committed=%s)', async committed => {
  const t = await setup({loss:true, committed});
  await expect(t.api.claim(draft, signal())).rejects.toMatchObject({kind:'network'});
  const outcome = await t.api.check(draft, signal());
  expect(outcome?.id ?? null).toBe(committed ? draft.id : null);
  expect(t.writes).toHaveLength(1);
});
it('rejects wrong room and malformed device ID', async () => {
  const t = await setup({mismatch:true});
  await expect(t.api.claim({...draft,id:'pilot/other'}, signal())).rejects.toMatchObject({kind:'validation'});
  await expect(t.api.claim(draft, signal())).rejects.toMatchObject({kind:'conflict'});
  expect(t.writes).toHaveLength(1);
});
