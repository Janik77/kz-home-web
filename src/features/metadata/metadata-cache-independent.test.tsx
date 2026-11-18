import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CoreWorkspace } from '../../app/core-workspace';
import { ThemeProvider } from '../../app/theme-provider';
import { createServices } from '../../data/create-services';
import { coreHouse, coreResponses } from '../../test/core-fixtures';

beforeEach(() => {
 window.history.replaceState(null, '', '/');
 vi.stubGlobal('matchMedia', vi.fn(() => ({ matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn() })));
 vi.spyOn(window,'scrollTo').mockImplementation(()=>undefined);
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');Reflect.deleteProperty(HTMLDialogElement.prototype,'close');});
it('verified rename defeats stale outer-house GET; Settings logout must explicitly discard a new draft',async()=>{
 let house={...coreHouse,metadata_revision:1,timezone:null,timezone_revision:1};
 let delay=false;let release!:(r:Response)=>void;let oldSignal:AbortSignal|null|undefined;let writes=0;
 const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
  const path=String(url).replace('/core-api','');
  if(path==='/houses'&&delay){oldSignal=init?.signal;return new Promise<Response>(resolve=>{release=resolve;});}
  if(path==='/houses')return Response.json([house]);
  if(path.endsWith('/me/permissions'))return Response.json({house_id:coreHouse.id,permissions:['house.read','house.manage','device.read','event.read','automation.read']});
  if(path===`/houses/${coreHouse.id}`){if(init?.method==='PATCH'){const body=JSON.parse(String(init.body));expect(body.expected_metadata_revision).toBe(1);writes++;house={...house,name:body.name,metadata_revision:2};}return Response.json(house);}
  return Response.json(coreResponses[path]);
 });
 const services=createServices({mode:'core',apiUrl:'/core-api'},fetcher);if(services.mode!=='core')throw Error();
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const view=render(<ThemeProvider><QueryClientProvider client={client}><CoreWorkspace services={services}/></QueryClientProvider></ThemeProvider>);
 fireEvent.change(screen.getByLabelText('Электронная почта'),{target:{value:'owner@example.test'}});fireEvent.change(screen.getByLabelText('Пароль'),{target:{value:'b'}});fireEvent.click(screen.getByRole('button',{name:'Войти'}));
 await screen.findByRole('heading',{name:coreHouse.name,level:1});
 await userEvent.click(screen.getByRole('link',{name:'Аккаунт и дома'}));
 await userEvent.click(await screen.findByRole('button',{name:'Изменить название дома'}));
 await userEvent.clear(await screen.findByLabelText('Название'));await userEvent.type(screen.getByLabelText('Название'),'Verified home');
 delay=true;const userId=services.session.getSnapshot().user!.id;
 void client.invalidateQueries({queryKey:['core-houses',userId]});await waitFor(()=>expect(release).toBeTypeOf('function'));
 await userEvent.click(screen.getByRole('button',{name:'Сохранить изменения'}));await screen.findByText('Изменения сохранены и прочитаны из Core.');
 expect(oldSignal?.aborted).toBe(true);delay=false;
 await act(async()=>{release(Response.json([coreHouse]));});
 expect(client.getQueryData(['core-houses',userId])).toEqual([expect.objectContaining({name:'Verified home'})]);expect(writes).toBe(1);
 await userEvent.type(screen.getByLabelText('Название'),' unsaved');await userEvent.click(screen.getByRole('button',{name:'Выйти'}));
 expect(await screen.findByRole('dialog')).toBeVisible();expect(services.session.getSnapshot().status).toBe('authenticated');
 await userEvent.click(screen.getByRole('button',{name:'Остаться'}));expect(screen.getByLabelText('Название')).toHaveValue('Verified home unsaved');
 await userEvent.click(screen.getByRole('button',{name:'Выйти'}));await userEvent.click(screen.getByRole('button',{name:'Отменить изменения и продолжить'}));
 await screen.findByLabelText('Электронная почта');expect(writes).toBe(1);
 view.unmount();client.clear();
});
