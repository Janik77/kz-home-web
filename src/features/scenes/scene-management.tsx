import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { useDraftGuard } from '../../app/draft-guard-context';
import { Button } from '../../components/ui/button';
import { CoreError } from '../../data/core/errors';
import { definitionError, validName } from '../../data/core/definitions';
import { type EditableScene, type SceneEditing, type SceneStep, scenePlanErrors, supportsSceneRelay } from '../../data/core/scene-editing';
import type { CoreDevice } from '../../data/core/dtos';
import { ActionPlanEditor } from '../definitions/action-plan-editor';
import { homeKey } from '../home/use-home';

function SceneForm({ initial, service, devices }: { initial: EditableScene; service: SceneEditing; devices: CoreDevice[] }) {
 const repository = useRepository(), client = useQueryClient();
 const [base,setBase]=useState(initial), [name,setName]=useState(initial.name), [plan,setPlan]=useState<SceneStep[]>(initial.plan ?? []);
 const [copyName,setCopyName]=useState(''), [copyId]=useState(()=>crypto.randomUUID());
 const [busy,setBusy]=useState(false), [blocked,setBlocked]=useState(false), [copyAttempted,setCopyAttempted]=useState(false), [confirm,setConfirm]=useState(false);
 const [error,setError]=useState(''), [notice,setNotice]=useState(''), [comparison,setComparison]=useState<EditableScene|null>(null);
 const task=useRef<AbortController|null>(null);
 const dirty=name!==base.name||JSON.stringify(plan)!==JSON.stringify(base.plan)||!!copyName;
 const discard=useDraftGuard(dirty,busy);
 useEffect(()=>()=>task.current?.abort(),[]);
 const reset=(v:EditableScene,discardCopy=false)=>{setBase(v);setName(v.name);setPlan(v.plan??[]);setComparison(null);setBlocked(false);setError('');setConfirm(false);if(discardCopy)setCopyName('');};
 const errors=scenePlanErrors(name,plan,devices);
 async function act(kind:'save'|'copy'|'activate'|'compare') {
  if(task.current || (kind!=='compare'&&blocked) || (kind==='copy'&&copyAttempted))return;
  const c=new AbortController();task.current=c;setBusy(true);setError('');setNotice('');
  if(kind==='copy')setCopyAttempted(true);
  try {
   if(kind==='compare'){const value=await service.read(base.id,c.signal);if(!c.signal.aborted)setComparison(value);return;}
   const saved=kind==='save'?await service.save(base,name,plan,c.signal):kind==='copy'?await service.duplicate(base,copyId,copyName,c.signal):await service.activate(base,c.signal);
   if(c.signal.aborted)return;
   await client.cancelQueries({queryKey:['scene-edit',saved.id]});if(c.signal.aborted)return;
   client.setQueryData(['scene-edit',saved.id],saved);
   if(kind!=='copy')reset(saved);else setCopyName('');
   setNotice(kind==='copy'?`Создан отдельный черновик «${saved.name}». Найдите его в списке: история исходного сценария не копируется.`:kind==='activate'?'Сценарий подготовлен. Устройства не переключались. Запуск выполняется отдельно.':'Название и действия сохранены и прочитаны из Core. Команды не отправлялись.');
   try {await client.cancelQueries({queryKey:homeKey});const home=await repository.getHome(c.signal);if(!c.signal.aborted)client.setQueryData(homeKey,home);}
   catch {if(!c.signal.aborted)setNotice(n=>n+' Список пока не обновился; обновите данные, не повторяйте запись.');}
  }catch(e){if(!c.signal.aborted){setError(definitionError(e));setBlocked(true);setConfirm(false);}}
  finally{if(!c.signal.aborted)setBusy(false);if(task.current===c)task.current=null;}
 }
 const supported=base.plan!==null&&base.isDraft!==undefined&&!!base.revision;
 if(!supported)return <p>Определение доступно только для чтения: нужен совместимый Core и полностью поддерживаемый план. Неизвестные поля не удаляются и не преобразуются.</p>;
 return <div className="definition-editor"><form onSubmit={e=>{e.preventDefault();void act('save');}}><fieldset disabled={busy}><legend>Название и действия сценария</legend><label>Название сценария<input value={name} onChange={e=>setName(e.target.value)}/></label><ActionPlanEditor scene actions={plan} onChange={setPlan} devices={devices.filter(supportsSceneRelay)}/>{errors.map(e=><p role="alert" key={e}>{e}</p>)}<div className="metadata-actions"><Button type="submit" disabled={blocked||!!errors.length||name===base.name&&JSON.stringify(plan)===JSON.stringify(base.plan)}>Сохранить сценарий</Button><Button variant="quiet" onClick={()=>discard(()=>reset(base,true))}>Отменить изменения</Button></div></fieldset></form>
 <p className="quiet-note">Сохранение меняет только описание действий. Устройства не переключаются. Подготовка черновика и запуск — отдельные действия.</p>
 {base.isDraft&&<div className="metadata-actions">{!confirm?<Button variant="secondary" disabled={busy||blocked||dirty||!!errors.length} onClick={()=>setConfirm(true)}>Подготовить к запуску</Button>:<><p>Подготовить эту версию сценария? Это не запуск и не отправка команд.</p><Button disabled={busy||blocked||dirty} onClick={()=>void act('activate')}>Подтвердить подготовку</Button><Button variant="quiet" disabled={busy} onClick={()=>setConfirm(false)}>Не сейчас</Button></>}</div>}
 <details><summary>Создать копию сценария</summary><label>Название копии<input disabled={busy||copyAttempted} value={copyName} onChange={e=>setCopyName(e.target.value)}/></label><p className="quiet-note">Копия сохранённой версии будет отдельным черновиком без истории запусков. Несохранённые изменения не копируются.</p><Button variant="secondary" disabled={busy||blocked||copyAttempted||!validName(copyName)||name!==base.name||JSON.stringify(plan)!==JSON.stringify(base.plan)} onClick={()=>void act('copy')}>Создать черновик-копию</Button>{copyAttempted&&<p>Для этой попытки идентификатор сохранён. Автоматической повторной копии не будет. Если ответ потерян, проверьте список; совпадение названия не подтверждает результат этой попытки.</p>}</details>
 {notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}{blocked&&<><p>Результат записи может быть неизвестен. Черновик сохранён; повторная запись заблокирована до сравнения.</p><Button variant="secondary" disabled={busy} onClick={()=>void act('compare')}>Сравнить сценарий с Core</Button></>}
 {comparison&&<aside className="automation-comparison"><h3>Актуальная версия Core</h3><p>{comparison.name} · версия {comparison.revision??'неизвестна'} · {comparison.isDraft?'Черновик':'Подготовлен'}</p><pre>{JSON.stringify(comparison.plan,null,2)}</pre><Button variant="secondary" disabled={busy} onClick={()=>discard(()=>reset(comparison,true))}>Принять данные Core</Button><Button variant="secondary" disabled={busy||!comparison.plan||comparison.isDraft===undefined||!comparison.revision} onClick={()=>{setBase(comparison);setComparison(null);setBlocked(false);setError('');}}>Оставить мои изменения для новой версии</Button></aside>}
 </div>;
}
function OpenScene({id,service}:{id:string;service:SceneEditing}) {
 const value=useQuery({queryKey:['scene-edit',id],queryFn:({signal})=>service.read(id,signal),retry:false});
 const devices=useQuery({queryKey:['scene-edit-devices'],queryFn:({signal})=>service.devices(signal),retry:false});
 const rights=useQuery({queryKey:['scene-edit-rights'],queryFn:({signal})=>service.permissions(signal),retry:false});
 if(value.isPending||devices.isPending||rights.isPending)return <p role="status">Проверяем сценарий, устройства и права…</p>;
 if([value.error,devices.error,rights.error].some(e=>e instanceof CoreError&&['unauthorized','forbidden','not-found'].includes(e.kind)))return <p role="alert">Доступ к сценарию или устройствам больше не разрешён. Изменение недоступно.</p>;
 if(!value.data||!devices.data||!rights.data)return <p role="alert">{definitionError(value.error??devices.error??rights.error)}</p>;
 if(!['scene.manage','scene.read','device.read'].every(p=>rights.data.includes(p)))return <p>Недостаточно прав для изменения сценария.</p>;
 return <SceneForm initial={value.data} service={service} devices={devices.data}/>;
}
export function SceneManagement({id}:{id:string}) {
 const service=useRepository().sceneEditing;const[open,setOpen]=useState(false);
 if(!service)return null;
 return <section className="scene-management">{!open?<Button variant="secondary" onClick={()=>setOpen(true)}>Изменить действия или создать копию</Button>:<OpenScene id={id} service={service}/>}</section>;
}
