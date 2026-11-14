import { expect,it,vi } from 'vitest';
import { createServices } from '../create-services';
import { coreResponses,coreFloor } from '../../test/core-fixtures';
async function setup(grants=['house.read','house.manage'], foreign=false, failure=0) {
 const writes:unknown[]=[];let saved:unknown;
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  const path=String(url).replace('/core-api','');
  if(path.endsWith('/me/permissions'))return Response.json({house_id:'house-a',permissions:grants});
  if(path==='/floors/floor-a')return Response.json({...coreFloor,house_id:foreign?'other':'house-a'});
  if(init?.method==='POST' && ['/rooms','/floors'].includes(path)){saved=JSON.parse(String(init.body));writes.push(saved);return failure?new Response(null,{status:failure}):Response.json(saved,{status:201});}
  if(path==='/rooms/new' || path==='/floors/new')return Response.json(saved);
  return Response.json(coreResponses[path]);
 });
 const service=createServices({mode:'core',apiUrl:'/core-api'},fetcher);if(service.mode!=='core')throw Error();await service.session.login('a','b');
 return {structure:service.repositoryForHouse('house-a').structure!,writes,fetcher};
}
it.each(['floor','room'] as const)('creates and reads back %s, never a device or command',async kind=>{
 const t=await setup();await t.structure.create({kind,id:'new',name:'  Новая  ',floorId:'floor-a'},new AbortController().signal);
 expect(t.writes).toEqual([kind==='floor'?{id:'new',name:'Новая',house_id:'house-a',order:0}:{id:'new',name:'Новая',floor_id:'floor-a'}]);
 expect(t.fetcher.mock.calls.some(([u])=>/commands|devices|run|enable/.test(String(u)))).toBe(false);
});
it.each([{grants:[]},{grants:['house.read']},{grants:['house.manage']}])('requires fresh manage and read grants %j',async ({grants})=>{
 const t=await setup(grants);await expect(t.structure.create({kind:'floor',id:'new',name:'Новый',floorId:''},new AbortController().signal)).rejects.toBeDefined();expect(t.writes).toEqual([]);
});
it('rejects a floor from another house before POST',async()=>{const t=await setup(undefined,true);await expect(t.structure.create({kind:'room',id:'new',name:'Новая',floorId:'floor-a'},new AbortController().signal)).rejects.toBeDefined();expect(t.writes).toEqual([]);});
it.each([401,403,409,422,503])('does not replay creation after %i',async failure=>{const t=await setup(undefined,false,failure);await expect(t.structure.create({kind:'floor',id:'new',name:'Новый',floorId:''},new AbortController().signal)).rejects.toBeDefined();expect(t.writes).toHaveLength(1);});
