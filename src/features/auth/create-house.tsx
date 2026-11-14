import { useEffect, useRef, useState } from 'react';
import type { CoreSession } from '../../data/core/session';
import { decodeHouse } from '../../data/core/dtos';
import { validName } from '../../data/core/definitions';
import { CoreError } from '../../data/core/errors';
import { Button } from '../../components/ui/button';
export function CreateHouse({session,onCreated,onGuardChange}:{session:CoreSession;onCreated:()=>void;onGuardChange:(state:{dirty:boolean;busy:boolean})=>void}) {
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[id,setId]=useState(()=>crypto.randomUUID()),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>onGuardChange({dirty:!!name,busy}),[name,busy,onGuardChange]);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(name||busy){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[name,busy]);
 async function save(){if(controller.current||!validName(name))return;const current=new AbortController();controller.current=current;setBusy(true);setMessage('');
 try{const body={id,name:name.trim()};await session.definitionWrite('/houses','POST',body,201,decodeHouse,current.signal);const saved=await session.read(`/houses/${encodeURIComponent(id)}`,decodeHouse,current.signal);if(saved.id!==id||saved.name!==body.name)throw new CoreError('conflict');if(current.signal.aborted)return;setName('');setOpen(false);setId(crypto.randomUUID());onCreated();}
 catch{if(!current.signal.aborted)setMessage('Создание не подтверждено или дом уже существует. Обновите список перед повтором. Черновик сохранён; автоматического повтора нет.');}
 finally{if(!current.signal.aborted)setBusy(false);if(controller.current===current)controller.current=null;}}
 return <section className="definition-editor"><Button variant="secondary" disabled={busy} onClick={()=>setOpen(!open)}>{open?'Свернуть черновик':'Создать дом'}</Button>{open&&<form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy}><legend>Новый дом</legend><label>Название дома<input required maxLength={255} value={name} onChange={e=>setName(e.target.value)} /></label><p className="quiet-note">Создаётся пустой дом для вашей учётной записи. Устройства и участники не добавляются.</p><Button type="submit" disabled={!validName(name)}>{busy?'Создаём…':'Сохранить дом'}</Button></fieldset></form>}{message&&<p role="alert">{message}</p>}</section>;
}
