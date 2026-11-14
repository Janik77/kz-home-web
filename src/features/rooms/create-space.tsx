import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { useDraftGuard } from '../../app/draft-guard-context';
import { Button } from '../../components/ui/button';
import { validName } from '../../data/core/definitions';
import { CoreError } from '../../data/core/errors';
import { homeKey } from '../home/use-home';
import type { HomeSnapshot } from '../../domain/home';
export function CreateSpace({home}: {home:HomeSnapshot}) {
 const structure = useRepository().structure, client = useQueryClient();
 const [open,setOpen]=useState(false), [kind,setKind]=useState<'floor'|'room'>('room'), [name,setName]=useState(''), [floorId,setFloorId]=useState(''), [id,setId]=useState(()=>crypto.randomUUID()), [busy,setBusy]=useState(false), [message,setMessage]=useState(''), [error,setError]=useState(false);
 const running=useRef<AbortController|null>(null);
 useEffect(()=>()=>running.current?.abort(),[]);
 const discard=useDraftGuard(open && !!name, busy);
 const rights=useQuery({queryKey:['structure-permissions'],queryFn:({signal})=>structure!.permissions(signal),enabled:!!structure,retry:false});
 if(!structure)return null;
 const allowed=rights.data?.includes('house.manage') && rights.data.includes('house.read') && !rights.isError;
 function clear(){setOpen(false);setName('');setFloorId('');setId(crypto.randomUUID());}
 async function save(){
  if(!allowed || running.current || !validName(name) || (kind==='room'&&!floorId))return;
  const controller=new AbortController();running.current=controller;setBusy(true);setMessage('');setError(false);
  try{await structure!.create({kind,id,name,floorId},controller.signal);if(controller.signal.aborted)return;clear();setMessage('Сохранено и проверено. Устройства не переключались.');void client.invalidateQueries({queryKey:homeKey});}
  catch(e){if(!controller.signal.aborted){setError(true);setMessage(e instanceof CoreError && e.kind==='forbidden'?'Нет прав на создание. Черновик сохранён.':'Сохранение не подтверждено или запись уже существует. Обновите данные и проверьте список перед повтором. Черновик сохранён, автоматического повтора нет.');}}
  finally{if(!controller.signal.aborted)setBusy(false);if(running.current===controller)running.current=null;}
 }
 return <section className="definition-editor space-create" aria-label="Добавление комнаты или этажа">
 {rights.isPending?<p role="status">Проверяем права…</p>:rights.isError?<p role="alert">Права недоступны. <Button variant="quiet" onClick={()=>void rights.refetch()}>Повторить проверку</Button></p>:!allowed?<p className="quiet-note">Создание доступно владельцу или администратору с правами управления домом.</p>:!open?<Button onClick={()=>setOpen(true)}>Добавить комнату или этаж</Button>:<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}><legend>Новое пространство</legend><label>Что добавить<select value={kind} onChange={e=>setKind(e.target.value as 'floor'|'room')}><option value="room">Комнату</option><option value="floor">Этаж</option></select></label><label>Название<input autoFocus required maxLength={255} value={name} onChange={e=>setName(e.target.value)} /></label>{kind==='room'&&<label>Этаж<select required value={floorId} onChange={e=>setFloorId(e.target.value)}><option value="">Выберите этаж</option>{home.floors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}{kind==='room'&&!home.floors.length&&<p>Сначала добавьте этаж.</p>}<div className="definition-buttons"><Button type="submit" disabled={!validName(name)||(kind==='room'&&!floorId)}>{busy?'Сохраняем…':'Создать'}</Button><Button variant="quiet" onClick={()=>discard(clear)}>Отмена</Button></div></fieldset></form>}
 {message&&<p role={error?'alert':'status'}>{message}</p>}
 </section>;
}
