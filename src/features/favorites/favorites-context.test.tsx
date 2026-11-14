import {act, fireEvent, screen, waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {renderHome} from '../../test/render-home';
import {createMockHomeRepository} from '../../data/mock/mock-home-repository';
import {initialHome} from '../../data/mock/fixtures';
import {FavoritesProvider} from './favorites-context';
import {FavoriteButton,FavoritesNotice} from './favorite-button';
import type {DeviceFavorites} from '../../data/core/favorites';
import {CoreError} from '../../data/core/errors';
function setup(read=vi.fn(async()=>[] as string[]),set=vi.fn<DeviceFavorites['set']>(async()=>{})){
 const view=renderHome({...createMockHomeRepository(initialHome,0),favorites:{read,set}},()=> <FavoritesProvider accountId="a" houseId="h"><FavoriteButton id="relay" name="Лампа"/><FavoritesNotice/></FavoritesProvider>);
 return {view,read,set};
}
it('waits for server and readback, guards repeated clicks, never optimistically selects',async()=>{
 let finish!:()=>void;const set=vi.fn<DeviceFavorites['set']>(()=>new Promise<void>(r=>{finish=r;}));
 const read=vi.fn(async()=>[] as string[]);setup(read,set);
 const button=await screen.findByRole('button',{name:'Добавить в избранное: Лампа'});await waitFor(()=>expect(button).toBeEnabled());
 fireEvent.click(button);fireEvent.click(button);await waitFor(()=>expect(set).toHaveBeenCalledTimes(1));
 expect(button).toHaveAttribute('aria-pressed','false');expect(button).toBeDisabled();
 read.mockResolvedValue(['relay']);await act(async()=>finish());
 await waitFor(()=>expect(button).toHaveAttribute('aria-pressed','true'));expect(read).toHaveBeenCalledTimes(2);
});
it.each([404,403,500])('does not mistake read error %i for empty favorites',async status=>{
 const read=vi.fn(async():Promise<string[]>=>{throw new CoreError(status===404?'not-found':status===403?'forbidden':'network');});setup(read);
 await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Добавить в избранное: Лампа'})).toBeDisabled();
});
it('requires explicit GET after uncertain write, never retries a mutation',async()=>{
 const set=vi.fn(async()=>{throw new CoreError('network');});const read=vi.fn(async()=>[] as string[]);setup(read,set);
 const button=await screen.findByRole('button',{name:'Добавить в избранное: Лампа'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);
 await screen.findByText(/Изменение могло сохраниться/);expect(set).toHaveBeenCalledTimes(1);
 read.mockResolvedValue(['relay']);fireEvent.click(screen.getByRole('button',{name:'Обновить избранное'}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Убрать из избранного: Лампа'})).toBeEnabled());expect(set).toHaveBeenCalledTimes(1);
});
it('aborts context teardown and discards late write without readback',async()=>{
 let finish!:()=>void;let signal!:AbortSignal;
 const set=vi.fn((_id:string,_v:boolean,s:AbortSignal)=>{signal=s;return new Promise<void>(r=>{finish=r;});});const {view,read}=setup(undefined,set);
 const button=await screen.findByRole('button',{name:'Добавить в избранное: Лампа'});await waitFor(()=>expect(button).toBeEnabled());fireEvent.click(button);await waitFor(()=>expect(set).toHaveBeenCalledTimes(1));
 view.unmount();expect(signal.aborted).toBe(true);await act(async()=>finish());expect(read).toHaveBeenCalledTimes(1);
 const next=setup();await waitFor(()=>expect(screen.getByRole('button',{name:'Добавить в избранное: Лампа'})).toBeEnabled());expect(next.set).not.toHaveBeenCalled();
});
