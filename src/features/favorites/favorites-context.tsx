import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { useHome } from '../home/use-home';
import { CoreError } from '../../data/core/errors';

type FavoritesState={ids:string[];known:boolean;ready:boolean;busy:boolean;message:string;error:string;refresh:()=>void;set:(id:string,value:boolean)=>void};
const Context=createContext<FavoritesState|null>(null);
// eslint-disable-next-line react-refresh/only-export-components
export const useFavorites=()=>useContext(Context);
function explain(error:unknown){
 if(error instanceof CoreError){
  if(error.kind==='not-found')return 'Избранное недоступно: сервер не поддерживает эту функцию либо доступ к дому или устройству изменился.';
  if(error.kind==='forbidden')return 'Нет прав на избранное в этом доме.';
  if(error.kind==='unauthorized')return 'Сеанс истёк. Войдите снова.';
  if(error.kind==='conflict')return 'Данные изменились. Обновите избранное перед новым действием.';
 }
 return 'Не удалось получить актуальное избранное. Проверьте связь и обновите список.';
}
/** Mounted per account + house, inside that context's isolated QueryClient. No browser storage. */
export function FavoritesProvider({accountId,houseId,children}:{accountId:string;houseId:string;children:ReactNode}){
 const repository=useRepository(),client=useQueryClient(),home=useHome();
 const key=['device-favorites',accountId,houseId];
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[writeError,setWriteError]=useState('');
 const active=useRef<AbortController|null>(null), mounted=useRef(true),previousHome=useRef(0);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;active.current?.abort();};},[]);
 const query=useQuery({queryKey:key,queryFn:({signal})=>repository.favorites!.read(signal),enabled:!!repository.favorites&&!!home.data,retry:false,staleTime:0});
 useEffect(()=>{
  if(previousHome.current && previousHome.current!==home.dataUpdatedAt && !active.current)void client.invalidateQueries({queryKey:['device-favorites',accountId,houseId]});
  previousHome.current=home.dataUpdatedAt;
 },[home.dataUpdatedAt,client,accountId,houseId]);
 const known=query.isSuccess&&!writeError;
 const ready=known&&!query.isFetching;
 async function set(id:string,value:boolean){
  if(!repository.favorites||!ready||active.current)return;
  const controller=new AbortController();active.current=controller;setBusy(true);setMessage('Сохраняем избранное…');setWriteError('');
  try{
   await client.cancelQueries({queryKey:key});
   await repository.favorites.set(id,value,controller.signal);
   controller.signal.throwIfAborted();
   const ids=await client.fetchQuery({queryKey:key,staleTime:0,queryFn:({signal})=>repository.favorites!.read(AbortSignal.any([signal,controller.signal]))});
   controller.signal.throwIfAborted();
   setMessage(ids.includes(id)===value?'Избранное сохранено.':'Список обновлён: сервер вернул другое состояние избранного.');
  }catch(error){if(!controller.signal.aborted&&mounted.current){setMessage('');setWriteError(`${explain(error)} Изменение могло сохраниться. Автоматического повтора нет.`);}}
  finally{if(active.current===controller)active.current=null;if(mounted.current&&!controller.signal.aborted)setBusy(false);}
 }
 const refresh=()=>{if(active.current)return;setWriteError('');setMessage('');void query.refetch();};
 const error=writeError || (query.isError?explain(query.error):'');
 return <Context value={{ids:known?query.data:[],known:!!known,ready:!!ready,busy,message:message || (query.isFetching?'Проверяем избранное…':''),error,refresh,set:(id,value)=>void set(id,value)}}>{children}</Context>;
}
