import {expect,it,vi} from 'vitest';
import {createServices} from '../create-services';
import {coreResponses} from '../../test/core-fixtures';
import {decodeFavorites} from './favorites';
async function setup(status=204){
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  if(String(url).includes('/device-favorites'))return init?.method==='GET'?Response.json({device_ids:['relay']}):new Response(null,{status});
  return String(url).endsWith('/auth/logout')?new Response(null,{status:204}):Response.json(coreResponses[String(url).replace('/core-api','')]);
 });
 const services=createServices({mode:'core',apiUrl:'/core-api'},fetcher);if(services.mode!=='core')throw Error();await services.session.login('a','b');return {services,fetcher,favorites:services.repositoryForHouse('house-a').favorites!};
}
it('uses the exact authenticated house API, no identity/body/command mutation, repeated set remains explicit',async()=>{
 const t=await setup(),signal=new AbortController().signal;
 expect(await t.favorites.read(signal)).toEqual(['relay']);
 await t.favorites.set('relay',true,signal);await t.favorites.set('relay',true,signal);await t.favorites.set('relay',false,signal);
 const calls=t.fetcher.mock.calls.filter(([url])=>String(url).includes('/device-favorites'));
 expect(calls.map(([url,init])=>[url,init?.method])).toEqual([
 ['/core-api/v1/houses/house-a/me/device-favorites','GET'],
 ...['PUT','PUT','DELETE'].map(method=>['/core-api/v1/houses/house-a/me/device-favorites/relay',method])]);
 for(const [,init]of calls){expect(init?.body).toBeUndefined();expect(new Headers(init?.headers).get('authorization')).toBeTruthy();}
});
it.each([401,403,404,409,422,429,500])('reports %i without hidden write retries',async status=>{const t=await setup(status);await expect(t.favorites.set('relay',true,new AbortController().signal)).rejects.toBeDefined();expect(t.fetcher.mock.calls.filter(([,i])=>i?.method==='PUT')).toHaveLength(1);});
it.each([null,{}, {device_ids:['a','a']},{device_ids:[1]},{device_ids:['']}])('rejects malformed favorites %j',value=>expect(()=>decodeFavorites(value)).toThrow());
it.each(['abort','logout'] as const)('discards a late write after %s even if fetch ignores abort',async ending=>{
 const t=await setup();let resolve!:(r:Response)=>void;
 t.fetcher.mockImplementation(async(url,init)=>init?.method==='PUT'?new Promise(r=>{resolve=r;}):String(url).endsWith('/auth/logout')?new Response(null,{status:204}):Response.json(coreResponses[String(url).replace('/core-api','')]));
 const controller=new AbortController(),result=t.favorites.set('relay',true,controller.signal);const rejected=expect(result).rejects.toBeDefined();
 if(ending==='abort')controller.abort();else await t.services.session.logout();resolve(new Response(null,{status:204}));await rejected;
});
