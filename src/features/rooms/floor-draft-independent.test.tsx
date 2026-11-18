import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { DraftGuard } from '../../app/draft-guard';
import { RepositoryProvider } from '../../app/services';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { initialHome } from '../../data/mock/fixtures';
import type { Metadata } from '../../data/core/metadata';
import { RoomsPage } from './rooms-page';
afterEach(()=>{Reflect.deleteProperty(HTMLDialogElement.prototype,'showModal');Reflect.deleteProperty(HTMLDialogElement.prototype,'close');});
it('floor filter requires explicit discard; Stay preserves the original draft and selection',async()=>{
 Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
 Object.defineProperty(HTMLDialogElement.prototype,'close',{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
 const metadata:Metadata={permissions:vi.fn(async()=>['house.read','house.manage']),read:vi.fn(async()=>({kind:'floor' as const,id:'ground',name:'Первый этаж',parentId:'family-home',revision:1})),save:vi.fn()};
 const repository={...createMockHomeRepository(initialHome,0),readOnly:true,metadata};
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
 const router=createMemoryRouter([{path:'/',element:<QueryClientProvider client={client}><RepositoryProvider value={repository}><DraftGuard><RoomsPage/></DraftGuard></RepositoryProvider></QueryClientProvider>}]);
 const view=render(<RouterProvider router={router}/>);
 try{
  await userEvent.click(await screen.findByText('Первый этаж · действия'));
  await userEvent.click(within(screen.getByText('Первый этаж · действия').closest('details')!).getByRole('button',{name:'Изменить название этажа'}));
  await userEvent.type(await screen.findByLabelText('Название'),' мой черновик');
  const filters=within(screen.getByRole('group',{name:'Фильтр по этажу'}));
  await userEvent.click(filters.getByRole('button',{name:'Второй этаж'}));
  let dialog=await screen.findByRole('dialog',{name:'Есть несохранённые изменения'});
  await userEvent.click(within(dialog).getByRole('button',{name:'Остаться'}));
  expect(screen.getByLabelText('Название')).toHaveValue('Первый этаж мой черновик');
  expect(filters.getByRole('button',{name:'Все комнаты'})).toHaveAttribute('aria-pressed','true');
  expect(metadata.save).not.toHaveBeenCalled();
  await userEvent.click(filters.getByRole('button',{name:'Второй этаж'}));
  dialog=await screen.findByRole('dialog',{name:'Есть несохранённые изменения'});
  await userEvent.click(within(dialog).getByRole('button',{name:'Отменить изменения и продолжить'}));
  expect(screen.queryByLabelText('Название')).not.toBeInTheDocument();
  expect(filters.getByRole('button',{name:'Второй этаж'})).toHaveAttribute('aria-pressed','true');
  expect(metadata.save).not.toHaveBeenCalled();
 }finally{view.unmount();client.clear();}
});
