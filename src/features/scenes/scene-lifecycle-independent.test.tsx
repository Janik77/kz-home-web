import { useQueryClient } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderHome } from '../../test/render-home';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { coreDevice } from '../../test/core-fixtures';
import { CoreError } from '../../data/core/errors';
import type { EditableScene, SceneEditing } from '../../data/core/scene-editing';
import { DraftGuardContext } from '../../app/draft-guard-context';
import { SceneManagement } from './scene-management';
const base:EditableScene={id:'s',houseId:'house-a',name:'Вечер',revision:4,isDraft:false,plan:[{type:'device_state',device_id:coreDevice.id,state:{on:true}}]};
function api():SceneEditing{return {permissions:vi.fn(async()=>['scene.read','scene.manage','device.read']),devices:vi.fn(async()=>[{...coreDevice,type:'relay',capabilities:['on_off']}]),read:vi.fn(async()=>base),save:vi.fn(async(b,name,plan)=>({...b,name,plan,revision:5})),duplicate:vi.fn(async(b,id,name)=>({...b,id,name,revision:1,isDraft:true})),activate:vi.fn(async b=>({...b,isDraft:false,revision:5}))};}
function Refresh(){const c=useQueryClient();return <button onClick={()=>void c.invalidateQueries({queryKey:['scene-edit']})}>Refresh review</button>;}
async function mount(service:SceneEditing){
 const register=vi.fn();const discard=vi.fn((action:()=>void)=>action());
 const view=renderHome({...createMockHomeRepository(initialHome,0),sceneEditing:service},()=> <DraftGuardContext value={{register,remove:vi.fn(),confirmDiscard:discard,confirmLeave:discard}}><Refresh/><SceneManagement id="s"/></DraftGuardContext>);
 await userEvent.click(await screen.findByRole('button',{name:'Изменить действия или создать копию'}));await screen.findByLabelText('Название сценария');
 return {...view,register,discard};
}
it('uncertain copy cannot replay; explicit discard clears copy draft but preserves attempted identity fence',async()=>{
 const service=api();vi.mocked(service.duplicate).mockRejectedValue(new CoreError('server'));const view=await mount(service);
 await userEvent.click(screen.getByText('Создать копию сценария'));await userEvent.type(screen.getByLabelText('Название копии'),'Копия');await userEvent.click(screen.getByRole('button',{name:'Создать черновик-копию'}));await screen.findByRole('button',{name:'Сравнить сценарий с Core'});
 expect(service.duplicate).toHaveBeenCalledTimes(1);expect(screen.getByLabelText('Название копии')).toHaveValue('Копия');expect(screen.getByRole('button',{name:'Создать черновик-копию'})).toBeDisabled();
 await userEvent.click(screen.getByRole('button',{name:'Отменить изменения'}));expect(view.discard).toHaveBeenCalled();expect(screen.getByLabelText('Название копии')).toHaveValue('');expect(screen.getByRole('button',{name:'Создать черновик-копию'})).toBeDisabled();expect(view.register).toHaveBeenLastCalledWith(expect.any(String),false,false);expect(service.duplicate).toHaveBeenCalledTimes(1);
});
it('cached successful read cannot retain editing after access is revoked',async()=>{
 const service=api();await mount(service);await userEvent.type(screen.getByLabelText('Название сценария'),' черновик');vi.mocked(service.read).mockRejectedValue(new CoreError('forbidden'));await userEvent.click(screen.getByRole('button',{name:'Refresh review'}));await screen.findByText(/Доступ к сценарию или устройствам больше не разрешён/);expect(screen.queryByLabelText('Название сценария')).not.toBeInTheDocument();expect(service.save).not.toHaveBeenCalled();
});
it('conflict retains plan draft and explicit rebase does not automatically retry',async()=>{
 const service=api();vi.mocked(service.save).mockRejectedValueOnce(new CoreError('conflict'));await mount(service);await userEvent.type(screen.getByLabelText('Название сценария'),' мой');await userEvent.click(screen.getByRole('button',{name:'Сохранить сценарий'}));await screen.findByRole('button',{name:'Сравнить сценарий с Core'});expect(screen.getByLabelText('Название сценария')).toHaveValue('Вечер мой');expect(screen.getByRole('button',{name:'Сохранить сценарий'})).toBeDisabled();vi.mocked(service.read).mockResolvedValue({...base,name:'Другое окно',revision:5});await userEvent.click(screen.getByRole('button',{name:'Сравнить сценарий с Core'}));await screen.findByText(/Другое окно · версия 5/);await userEvent.click(screen.getByRole('button',{name:'Оставить мои изменения для новой версии'}));expect(service.save).toHaveBeenCalledTimes(1);expect(screen.getByLabelText('Название сценария')).toHaveValue('Вечер мой');
});
it('scope unmount aborts a pending copy and ignores late success in the next scope',async()=>{
 const service=api();let resolve!:(v:EditableScene)=>void;const pending=new Promise<EditableScene>(r=>{resolve=r;});let signal:AbortSignal|undefined;vi.mocked(service.duplicate).mockImplementation(async(_b,_id,_name,s)=>{signal=s;return pending;});const first=await mount(service);await userEvent.click(screen.getByText('Создать копию сценария'));await userEvent.type(screen.getByLabelText('Название копии'),'Старая копия');await userEvent.click(screen.getByRole('button',{name:'Создать черновик-копию'}));first.unmount();expect(signal?.aborted).toBe(true);const next=api();vi.mocked(next.read).mockResolvedValue({...base,name:'Другой дом'});await mount(next);await act(async()=>{resolve({...base,id:'copy',name:'Старая копия',isDraft:true,revision:1});await pending;});expect(screen.getByLabelText('Название сценария')).toHaveValue('Другой дом');expect(screen.queryByText(/Создан отдельный черновик/)).not.toBeInTheDocument();expect(next.duplicate).not.toHaveBeenCalled();
});
