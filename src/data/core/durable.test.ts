import {decodeScene} from './dtos';
import { expect, it } from 'vitest';
import { decodeDurableWait, validDurablePlan, decodeWaitRunAction } from './durable';
import { decodeSceneRun, checkRun } from './scene-runs';
import { decodeEditableAutomation, decodeAutomationRun } from './automations';
const relay={type:'device_state' as const,device_id:'r',state:{on:true}};
const wait={type:'durable_wait' as const,seconds:5};
it.each([0,-1,1.5,3601,NaN,'5',true])('rejects invalid wait %s',seconds=>expect(()=>decodeDurableWait({type:'durable_wait',seconds})).toThrow());
it('validates durable order and total without converting legacy delay',()=>{
 expect(validDurablePlan([relay,wait,relay])).toBe(true);
 for(const actions of [[wait,relay],[relay,wait],[relay,wait,wait,relay],[relay,{...wait,seconds:3600},relay,wait,relay],Array.from({length:17},(_,i)=>i===1?wait:relay)]) expect(validDurablePlan(actions)).toBe(false);
 expect(()=>decodeDurableWait({type:'delay',seconds:5})).toThrow();
});
const created='2026-11-18T00:00:00Z',due='2026-11-18T00:00:05Z',resume='2026-11-18T00:00:35Z',deadline='2026-11-18T00:01:05Z';
const a={position:0,device_id:'r',requested_on:true,status:'ready',failure_code:null,receipt:null};
const w={position:1,type:'durable_wait',device_id:null,requested_on:null,seconds:5,due_at:due,resume_deadline:resume,status:'waiting',failure_code:null,receipt:null};
const run={id:'run',house_id:'h',scene_id:'s',scene_revision:1,execution_mode:'server',execution_error:null,created_at:created,dispatch_deadline:deadline,plan_deadline:deadline,wait_due_at:due,resume_deadline:resume,status:'waiting',actions:[a,w,{...a,position:2}]};
it('decodes durable checkpoint and prevents timestamp/plan substitution',()=>{
 const before=decodeSceneRun(run);expect(before.status).toBe('waiting'); expect(before.actions[1]).toMatchObject({seconds:5,receipt:null});
 expect(()=>decodeSceneRun({...run,plan_deadline:undefined})).toThrow();
 expect(()=>decodeWaitRunAction({...w,receipt:{command_id:'fake'}})).toThrow();
 expect(()=>decodeWaitRunAction({...w,resume_deadline:null})).toThrow();
 const after=decodeSceneRun({...run,wait_due_at:'2026-11-18T00:00:06Z',actions:[a,{...w,due_at:'2026-11-18T00:00:06Z'},{...a,position:2}]});expect(()=>checkRun(before,after)).toThrow();
});
it('automations decode waiting/cancelled without inventing successful device action',()=>{
 const value={...run,automation_id:'a',automation_revision:1};expect(decodeAutomationRun(value).status).toBe('waiting');
 const cancelled={...value,status:'cancelled',cancelled_at:'2026-11-18T00:00:03Z',wait_due_at:undefined,resume_deadline:undefined,actions:[a,{...w,status:'cancelled'},{...a,position:2,status:'skipped'}]};expect(decodeAutomationRun(cancelled).status).toBe('cancelled');expect(()=>decodeAutomationRun({...value,status:'succeeded'})).toThrow();
});
it('edits explicit durable definitions but keeps legacy delay readonly',()=>{
 const rule={id:'a',house_id:'h',name:'Wait',enabled:false,revision:1,trigger:{type:'device_state',device_id:'r',field:'on',operator:'eq',value:true},conditions:[],actions:[relay,wait,relay]};
 expect(decodeEditableAutomation(rule).draft?.actions).toEqual(rule.actions);
 expect(decodeEditableAutomation({...rule,actions:[relay,{type:'delay',seconds:5},relay]}).draft).toBeNull();
});

it('accepts actual durable cancelled or expired relay successors, never legacy or receipt-bearing terminal substitutions',()=>{
 const cancelled={...run,status:'cancelled',cancelled_at:due,wait_due_at:undefined,resume_deadline:undefined,actions:[a,{...w,status:'cancelled'},{...a,position:2,status:'cancelled'}]};
 expect(decodeSceneRun(cancelled).actions[2]?.status).toBe('cancelled');expect(decodeAutomationRun({...cancelled,automation_id:'a',automation_revision:1}).actions[2]?.status).toBe('cancelled');
 const expired={...cancelled,status:'expired',cancelled_at:undefined,actions:[a,{...w,status:'expired'},{...a,position:2,status:'expired'}]};expect(decodeSceneRun(expired).status).toBe('expired');
 expect(()=>decodeSceneRun({...run,status:'cancelled',cancelled_at:undefined})).toThrow();
 expect(()=>decodeSceneRun({...run,wait_due_at:'2026-11-18T00:00:07Z'})).toThrow();
 expect(()=>decodeSceneRun({...run,status:'stopped',plan_deadline:undefined,wait_due_at:undefined,resume_deadline:undefined,actions:[{...a,status:'cancelled'}]})).toThrow();
});

it('keeps durable relay extensions read-only rather than silently dropping constraints',()=>{
 const actions=[{...relay,future_constraint:{required:true}},wait,relay];
 const rule={id:'a',house_id:'h',name:'Future',enabled:false,revision:1,trigger:{type:'device_state',device_id:'r',field:'on',operator:'eq',value:true},conditions:[],actions};
 expect(decodeEditableAutomation(rule).draft).toBeNull();
 const scene=decodeScene({...rule,created_at:created,updated_at:created});expect(scene.actions[0]).toMatchObject({unsupported:true});
});
