import { expect, it, vi } from 'vitest';
import { HttpClient } from './http-client';
import { CoreSession } from './session';
import { readHousePermissions } from './permissions';
import { createRelayControl } from './relay-control';
import { coreDevice, coreUser, tokenPair } from '../../test/core-fixtures';

async function setup() {
  let payload: unknown = { house_id: 'house-a', permissions: ['device.control', 'device.read'] };
  let status = 200;
  const fetcher = vi.fn<typeof fetch>(async url => {
    if (String(url).endsWith('/auth/login')) return Response.json(tokenPair);
    if (String(url).endsWith('/auth/me')) return Response.json(coreUser);
    if (String(url).endsWith('/auth/logout')) return new Response(null, { status: 204 });
    if (String(url).includes('/devices?')) return Response.json([{...coreDevice, type:'relay', capabilities:['on_off']}]);
    return Response.json(payload, {status});
  });
  const session = new CoreSession(new HttpClient('/core-api', fetcher));
  await session.login('test@example.test','test');
  return {session, fetcher, control:createRelayControl(session,'house-a'), set:(v:unknown,s=200)=>{payload=v;status=s;}};
}
it.each(['owner','resident','installer','technician'])('uses server permissions for %s without reading a role',async () => {
  const h=await setup(); expect(await h.control.eligible(new AbortController().signal)).toEqual([coreDevice.id]);
  expect(h.fetcher.mock.calls.some(([url])=>String(url).endsWith('/members'))).toBe(false);
});
it.each([null, {}, {house_id:'other',permissions:['device.control','device.read']},
  {house_id:'house-a',permissions:'device.control'}, {house_id:'house-a',permissions:[true]},
  {house_id:'house-a',permissions:['device.control','device.control']},
])('rejects malformed or foreign permission response %j before POST',async value=>{
  const h=await setup();h.set(value);
  await expect(h.control.run(coreDevice.id,true,vi.fn(),new AbortController().signal)).rejects.toMatchObject({kind:'protocol'});
  expect(h.fetcher.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1); // login only
});
it.each([[],['device.read'],['device.control']].map(permissions=>({permissions})))('fails closed on insufficient permissions %j',async ({permissions})=>{
  const h=await setup();h.set({house_id:'house-a',permissions});
  expect(await h.control.eligible(new AbortController().signal)).toEqual([]);
});
it.each([403,404,500])('permission HTTP %s cannot authorize a POST',async status=>{
  const h=await setup();h.set({},status);
  await expect(h.control.run(coreDevice.id,true,vi.fn(),new AbortController().signal)).rejects.toThrow();
  expect(h.fetcher.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
it('rechecks revoked permission immediately before submission',async()=>{
  const h=await setup();expect(await h.control.eligible(new AbortController().signal)).toEqual([coreDevice.id]);
  h.set({house_id:'house-a',permissions:['device.read']});
  await expect(h.control.run(coreDevice.id,true,vi.fn(),new AbortController().signal)).rejects.toMatchObject({kind:'forbidden'});
  expect(h.fetcher.mock.calls.filter(([,o])=>o?.method==='POST')).toHaveLength(1);
});
it.each(['house switch','logout','session switch'])('rejects late permission responses after %s',async reason=>{
  const h=await setup();let finish!:(r:Response)=>void;
  h.fetcher.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));
  const controller=new AbortController();
  const read=readHousePermissions(h.session,'house-a',controller.signal);
  const assertion=expect(read).rejects.toThrow();
  if(reason!=='house switch') await h.session.logout();else controller.abort();
  if(reason==='session switch') await h.session.login('new@example.test','test');
  finish(Response.json({house_id:'house-a',permissions:['device.control','device.read']}));await assertion;
});
it('fails closed on network loss and rejected session refresh',async()=>{
  for(const network of [true,false]) {
    const h=await setup();
    if(network)h.fetcher.mockRejectedValueOnce(new TypeError('network'));
    else h.fetcher.mockResolvedValue(new Response(null,{status:401}));
    await expect(h.control.run(coreDevice.id,true,vi.fn(),new AbortController().signal)).rejects.toThrow();
    expect(h.fetcher.mock.calls.some(([url,o])=>String(url).includes('/commands')&&o?.method==='POST')).toBe(false);
  }
});
