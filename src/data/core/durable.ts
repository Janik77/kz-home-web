import { CoreError } from './errors';
export interface DurableWait { type: 'durable_wait'; seconds: number }
export function isDurableWait(value: { type?: string | undefined }): value is DurableWait { return value.type === 'durable_wait'; }
export function decodeDurableWait(value: unknown): DurableWait {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoreError('protocol');
 const v=value as Record<string,unknown>;
 if(v.type!=='durable_wait'||Object.keys(v).some(k=>!['type','seconds'].includes(k))||typeof v.seconds!=='number'||!Number.isInteger(v.seconds)||v.seconds<1||v.seconds>3600) throw new CoreError('protocol');
 return {type:'durable_wait',seconds:v.seconds};
}
export function validDurablePlan(actions: { type?: string | undefined; seconds?: number }[]): boolean {
 if(!actions.some(isDurableWait)) return true;
 if(actions.length>16 || isDurableWait(actions[0]!) || isDurableWait(actions[actions.length-1]!)) return false;
 let total=0;
 for(let i=0;i<actions.length;i++) if(isDurableWait(actions[i]!)) { try { const wait=decodeDurableWait(actions[i]);total+=wait.seconds; } catch{return false;} if(i>0&&isDurableWait(actions[i-1]!))return false; }
 return total<=3600;
}
export const waitExplanation='Пауза начинается только после ACK и подтверждения предыдущего действия. Core сохраняет ожидание; закрытие страницы его не отменяет. После срока возобновления оставшиеся шаги не догоняются.';

export interface WaitRunAction { type:'durable_wait'; position:number; device_id:null; requested_on:null; seconds:number; due_at:string|null; resume_deadline:string|null; status:'waiting'|'ready'|'completed'|'cancelled'|'expired'; failure_code:string|null; receipt:null }
export function decodeWaitRunAction(value: Record<string,unknown>): WaitRunAction {
 const v=value;
 if(v.type!=='durable_wait'||v.device_id!==null||v.requested_on!==null||v.receipt!==null||!Number.isSafeInteger(v.position)||Number(v.position)<0||!['waiting','ready','completed','cancelled','expired'].includes(String(v.status)))throw new CoreError('protocol');
 const wait=decodeDurableWait({type:v.type,seconds:v.seconds});
 for(const key of ['due_at','resume_deadline']) if(v[key]!==null&&(typeof v[key]!=='string'||!Number.isFinite(Date.parse(v[key] as string))))throw new CoreError('protocol');
 if((v.due_at===null)!==(v.resume_deadline===null)|| (v.due_at!==null&&Date.parse(v.resume_deadline as string)<=Date.parse(v.due_at as string)) || (v.status==='completed'&&v.due_at===null))throw new CoreError('protocol');
 if(v.failure_code!==null&&typeof v.failure_code!=='string')throw new CoreError('protocol');
 return {type:'durable_wait',position:v.position as number,device_id:null,requested_on:null,seconds:wait.seconds,due_at:v.due_at as string|null,resume_deadline:v.resume_deadline as string|null,status:v.status as WaitRunAction['status'],failure_code:v.failure_code as string|null,receipt:null};
}
export interface DurableRunFields {plan_deadline?:string;wait_due_at?:string;resume_deadline?:string;cancelled_at?:string}
export function decodeDurableRunFields(v:Record<string,unknown>):DurableRunFields {
 const out:DurableRunFields={};
 for(const key of ['plan_deadline','wait_due_at','resume_deadline','cancelled_at'] as const) if(v[key]!==undefined){if(typeof v[key]!=='string'||!Number.isFinite(Date.parse(v[key])))throw new CoreError('protocol');out[key]=v[key];}
 if((out.wait_due_at===undefined)!==(out.resume_deadline===undefined)|| (out.wait_due_at&&Date.parse(out.resume_deadline!)<=Date.parse(out.wait_due_at)) || ((out.wait_due_at||out.cancelled_at)&&!out.plan_deadline))throw new CoreError('protocol');
 return out;
}

export function validateDurableRun(v:Record<string,unknown>,actions:({status:string;receipt:unknown;type?:string;due_at?:string|null;resume_deadline?:string|null})[],fields:DurableRunFields){
 const waits=actions.filter(a=>a.type==='durable_wait');
 if(Boolean(waits.length)!==Boolean(fields.plan_deadline))throw new CoreError('protocol');
 if(fields.plan_deadline&&v.dispatch_deadline!==undefined&&fields.plan_deadline!==v.dispatch_deadline)throw new CoreError('protocol');
 if(v.status==='waiting'&&(!fields.wait_due_at||!waits.some(a=>a.status==='waiting'&&a.due_at===fields.wait_due_at&&a.resume_deadline===fields.resume_deadline)))throw new CoreError('protocol');
 if(v.status!=='waiting'&&(fields.wait_due_at||fields.resume_deadline))throw new CoreError('protocol');
 if(v.status==='cancelled'&&!fields.cancelled_at)throw new CoreError('protocol');
 if(actions.some(a=>a.type!=='durable_wait'&&['cancelled','expired'].includes(a.status)&&(!fields.plan_deadline||a.receipt!==null)))throw new CoreError('protocol');
}
