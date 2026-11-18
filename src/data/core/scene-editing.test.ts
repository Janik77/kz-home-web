import { decodeScene } from './dtos';
import { mapHome } from './mapping';
import { expect, it, vi } from 'vitest';
import { createServices } from '../create-services';
import { coreResponses, coreDevice } from '../../test/core-fixtures';
import { decodeEditableScene } from './scene-editing';
const signal=()=>new AbortController().signal;
const plan=[{type:'device_state',device_id:'lamp-a',state:{on:true}}];
async function setup({failure=0,permissions=['scene.read','scene.manage','device.read'],isDraft=false}={}) {
 const rows:Record<string,Record<string,unknown>>={'/scenes/s':{id:'s',house_id:'house-a',name:'Вечер',revision:4,is_draft:isDraft,actions:plan}};
 const writes:{path:string;body:Record<string,unknown>}[]=[];
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  const path=String(url).replace('/core-api','');
  if(path.endsWith('/me/permissions'))return Response.json({house_id:'house-a',permissions});
  if(path.startsWith('/devices?'))return Response.json([{...coreDevice,type:'relay',capabilities:['on_off'],state:{},online:false}]);
  if(init?.method==='POST'&&path!=='/auth/login'||init?.method==='PATCH'){
   const body=JSON.parse(String(init?.body));writes.push({path,body});if(failure)return new Response(null,{status:failure});
   const src=rows['/scenes/s']!;
   if(path.endsWith('/duplicate')){const copy={...src,id:body.id,name:body.name,revision:1,is_draft:true};rows[`/scenes/${body.id}`]=copy;return Response.json(copy,{status:201});}
   const saved={...src,revision:Number(src.revision)+1,...(path.endsWith('/activate')?{is_draft:false}:{name:body.name,actions:body.actions})};rows['/scenes/s']=saved;return Response.json(saved);
  }
  return Response.json(rows[path]??coreResponses[path]);
 });
 const services=createServices({mode:'core',apiUrl:'/core-api'},fetcher);if(services.mode!=='core')throw Error();await services.session.login('a','b');
 return{api:services.repositoryForHouse('house-a').sceneEditing!,rows,writes,fetcher};
}
it('full scene editing has CAS, verified readback and no execution',async()=>{const t=await setup(),base=await t.api.read('s',signal());const saved=await t.api.save(base,' Новый ',[{...plan[0]!,type:'device_state',state:{on:false}}],signal());expect(saved.name).toBe('Новый');expect(saved.revision).toBe(5);expect(t.writes).toEqual([{path:'/scenes/s',body:{name:'Новый',actions:[{...plan[0],state:{on:false}}],expected_revision:4}}]);});
it('copy is forced draft revision1, source unchanged and zero commands',async()=>{const t=await setup(),base=await t.api.read('s',signal());const saved=await t.api.duplicate(base,'copy','Копия',signal());expect(saved).toMatchObject({id:'copy',isDraft:true,revision:1});expect(t.rows['/scenes/s']).toMatchObject({revision:4,is_draft:false});expect(t.writes).toEqual([{path:'/scenes/s/duplicate',body:{id:'copy',name:'Копия',expected_revision:4}}]);});
it('prepares offline relay with no current state without running it',async()=>{const t=await setup({isDraft:true}),base=await t.api.read('s',signal());expect(await t.api.activate(base,signal())).toMatchObject({isDraft:false,revision:5});expect(t.writes).toEqual([{path:'/scenes/s/activate',body:{expected_revision:4}}]);});
it.each([409,503])('copy failure %i never inferred as success or replayed',async failure=>{const t=await setup({failure}),base=await t.api.read('s',signal());await expect(t.api.duplicate(base,'copy','Копия',signal())).rejects.toBeDefined();expect(t.writes).toHaveLength(1);expect(t.fetcher.mock.calls.some(([url])=>String(url).endsWith('/scenes/copy'))).toBe(false);});
it('stale source rejects before mutation',async()=>{const t=await setup(),base=await t.api.read('s',signal());t.rows['/scenes/s']!.revision=5;await expect(t.api.save(base,'Новый',base.plan!,signal())).rejects.toMatchObject({kind:'conflict'});expect(t.writes).toHaveLength(0);});
it('lost management permission fails closed',async()=>{const t=await setup({permissions:['scene.read']}),base=await t.api.read('s',signal());await expect(t.api.duplicate(base,'copy','Копия',signal())).rejects.toMatchObject({kind:'forbidden'});expect(t.writes).toHaveLength(0);});
it('old Core cannot acquire guessed lifecycle support',async()=>{const t=await setup();delete t.rows['/scenes/s']!.is_draft;const base=await t.api.read('s',signal());await expect(t.api.save(base,'Новый',base.plan!,signal())).rejects.toMatchObject({kind:'read-only'});expect(t.writes).toHaveLength(0);});
it.each([{actions:[{...plan[0],future_constraint:true}]},{actions:[{type:'delay',seconds:2}]},{future_constraint:true}])('unknown definitions stay readonly: %j',extra=>{expect(decodeEditableScene({id:'s',house_id:'house-a',name:'x',revision:1,is_draft:false,actions:plan,...extra}).plan).toBeNull();});

it.each([{type:'durable_wait',seconds:5,future_constraint:true},{future_constraint:true},{type:null},{type:'device_state',state:{on:true}}])('unsupported raw action %j leaves home scene readable but not executable',action=>{const raw={id:'s',house_id:'house-a',name:'x',revision:1,is_draft:false,actions:[action]};expect(decodeEditableScene(raw).plan).toBeNull();const mapped=mapHome({id:'house-a',name:'Home'},[],[],[],[decodeScene(raw)]).scenes[0]!;expect(mapped.readActions?.[0]?.unsupported).toBe(true);expect(mapped.actions).toEqual([]);});
