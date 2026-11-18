import { expect, it, vi } from 'vitest';
import { createHouseClock, decodeHouseTimezone, decodeSchedule, scheduleDescription } from './schedules';
import { decodeEditableAutomation, automationErrors } from './automations';
import type { CoreSession } from './session';
const trigger = { type: 'schedule', time: '08:15', weekdays: [4, 0] };
it('canonicalizes weekdays, accepts Monday0 and never invents timezone', () => {
 expect(decodeSchedule(trigger).weekdays).toEqual([0,4]); expect(scheduleDescription(trigger)).toContain('Пн, Пт');
 expect(decodeHouseTimezone({id:'h',timezone:null,timezone_revision:1}).timezone).toBeNull();
 expect(() => decodeHouseTimezone({id:'h'})).toThrow();
});
it.each([{...trigger,time:'24:00'},{...trigger,time:'8:15'},{...trigger,weekdays:[]},{...trigger,weekdays:[0,0]},{...trigger,weekdays:[7]},{...trigger,weekdays:[true]},{...trigger,timezone:'UTC'},{...trigger,catchup:true},{...trigger,device_id:null}])('rejects unsupported or malformed schedule %j', value => expect(() => decodeSchedule(value)).toThrow());
it('reads editable schedule without losing conditions or requiring a sensor', () => {
 const value={id:'r',house_id:'h',name:'Morning',enabled:false,revision:1,trigger,conditions:[],actions:[{type:'device_state',device_id:'relay',state:{on:true}}]};
 const rule=decodeEditableAutomation(value); expect(rule.draft?.trigger).toEqual({...trigger,weekdays:[0,4]});
 expect(automationErrors(rule.draft!,[{id:'relay',name:'Relay',room_id:'room',type:'relay',capabilities:['on_off'],state:{on:false},online:true,updated_at:'2026-11-18T00:00:00Z'}])).toEqual([]);
});
it('timezone write rechecks rights, passes CAS, verifies response and readback', async () => {
 const read=vi.fn(async(path:string,decode:(v:unknown)=>unknown)=>decode(path.endsWith('/permissions')?{house_id:'h',permissions:['house.manage']}: {id:'h',timezone:'Asia/Almaty',timezone_revision:3}));
 const definitionWrite=vi.fn(async(_p:string,_m:string,_b:unknown,_s:number,decode:(v:unknown)=>unknown)=>decode({id:'h',timezone:'Asia/Almaty',timezone_revision:3}));
 const service=createHouseClock({read,definitionWrite} as unknown as CoreSession,'h');
 await service.save('Asia/Almaty',2,new AbortController().signal);
 expect(definitionWrite).toHaveBeenCalledWith('/houses/h','PATCH',{timezone:'Asia/Almaty',expected_timezone_revision:2},200,expect.any(Function),expect.any(AbortSignal));
});

it('keeps schedule with unknown meaningful fields readable but never edits lossily', () => {
 const rule=decodeEditableAutomation({id:'r',house_id:'h',name:'Legacy',enabled:false,revision:1,trigger:{...trigger,catchup:true},conditions:[],actions:[{type:'device_state',device_id:'relay',state:{on:true}}]});
 expect(rule.trigger).toContain('По расписанию'); expect(rule.draft).toBeNull();
});
