import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { useQueryClient } from '@tanstack/react-query';
import { renderHome } from '../../test/render-home';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { HouseTimezoneSettings } from './house-timezone';
import { AutomationWorkspace } from '../automations/automation-workspace';
import { decodeEditableAutomation, type Automations, type EditableAutomation } from '../../data/core/automations';
import type { HouseClock, HouseTimezone } from '../../data/core/schedules';

function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(r=>{resolve=r;}); return {promise,resolve}; }
function RefreshClock() {const client=useQueryClient(); return <button onClick={()=>void client.invalidateQueries({queryKey:['house-clock']})}>Force old clock read</button>;}
const device={id:'relay-a',name:'Relay',room_id:'room-a',type:'relay',capabilities:['on_off'],state:{on:false},online:true,updated_at:'2026-11-18T00:00:00Z'};

it('rejects late pre-save clock read and immediately creates, saves and enables a schedule without reload',async()=>{
 const old=deferred<HouseTimezone>(); let reads=0; let saved:EditableAutomation|undefined;
 const clock:HouseClock={permissions:async()=>['house.manage'],read:vi.fn(async()=>++reads===1?{id:'house-a',timezone:null,revision:1}:old.promise),save:vi.fn(async(timezone,revision)=>{expect(revision).toBe(1);return{id:'house-a',timezone,revision:2};})};
 const toggle=vi.fn<Automations['toggle']>(async(_id,_enabled,revision)=>{expect(revision).toBe(1);return{...saved!,enabled:true,revision:2};});
 const automation:Automations={permissions:async()=>['automation.read','automation.manage'],devices:async()=>[device],read:async()=>saved!,save:vi.fn(async draft=>{saved=decodeEditableAutomation({...draft,house_id:'house-a',enabled:false,revision:1});return saved;}),toggle,check:vi.fn(),runs:async()=>[]};
 const repo={...createMockHomeRepository(initialHome,0),houseClock:clock,automations:automation,activity:{automations:async()=>saved?[saved]:[],events:async()=>[]}};
 renderHome(repo,()=> <><HouseTimezoneSettings/><RefreshClock/><AutomationWorkspace/></>);
 await screen.findByLabelText('Часовой пояс (IANA)');
 await userEvent.click(screen.getByRole('button',{name:'Force old clock read'}));
 await userEvent.type(screen.getByLabelText('Часовой пояс (IANA)'),'Asia/Almaty');
 await userEvent.click(screen.getByRole('button',{name:'Сохранить часовой пояс'}));
 await screen.findByText('Часовой пояс сохранён и прочитан из Core.');
 await act(async()=>{old.resolve({id:'house-a',timezone:null,revision:1});await old.promise;});
 expect(screen.getByLabelText('Часовой пояс (IANA)')).toHaveValue('Asia/Almaty');
 await userEvent.click(screen.getByRole('button',{name:'Создать правило'}));
 await userEvent.type(screen.getByLabelText('Название правила'),'Morning');
 await userEvent.selectOptions(screen.getByLabelText('Тип запуска'),'schedule');
 expect(screen.getByText('Часовой пояс дома: Asia/Almaty.')).toBeInTheDocument();
 await userEvent.selectOptions(screen.getByLabelText('Действие 1: устройство'),'relay-a');
 await userEvent.click(screen.getByRole('button',{name:'Сохранить правило'}));
 await screen.findByText(/Правило сохранено и прочитано/);
 await userEvent.click(screen.getByRole('button',{name:'Включить правило'}));
 await userEvent.click(screen.getByRole('button',{name:'Подтвердить включение'}));
 expect(toggle).toHaveBeenCalledTimes(1);
 expect(toggle).toHaveBeenCalledWith(saved!.id,true,1,expect.any(AbortSignal));
});

it('aborts old scope timezone save and ignores readback after account or house subtree unmount',async()=>{
 const pending=deferred<HouseTimezone>();let signal:AbortSignal|undefined;
 const clock:HouseClock={permissions:async()=>['house.manage'],read:async()=>({id:'house-a',timezone:null,revision:1}),save:async(_zone,_revision,s)=>{signal=s;return pending.promise;}};
 const first=renderHome({...createMockHomeRepository(initialHome,0),houseClock:clock},()=> <HouseTimezoneSettings/>);
 await userEvent.type(await screen.findByLabelText('Часовой пояс (IANA)'),'Asia/Almaty');
 await userEvent.click(screen.getByRole('button',{name:'Сохранить часовой пояс'}));
 first.unmount();expect(signal?.aborted).toBe(true);
 const nextClock:HouseClock={permissions:async()=>['house.manage'],read:async()=>({id:'house-b',timezone:'UTC',revision:7}),save:vi.fn()};
 renderHome({...createMockHomeRepository(initialHome,0),houseClock:nextClock},()=> <HouseTimezoneSettings/>);
 expect(await screen.findByLabelText('Часовой пояс (IANA)')).toHaveValue('UTC');
 await act(async()=>{pending.resolve({id:'house-a',timezone:'Asia/Almaty',revision:2});await pending.promise;});
 expect(screen.getByLabelText('Часовой пояс (IANA)')).toHaveValue('UTC');
 expect(screen.queryByText('Часовой пояс сохранён и прочитан из Core.')).not.toBeInTheDocument();
 expect(nextClock.save).not.toHaveBeenCalled();
});
