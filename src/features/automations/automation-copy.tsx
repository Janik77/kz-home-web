import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDraftGuard } from '../../app/draft-guard-context';
import { Button } from '../../components/ui/button';
import { definitionError, validName } from '../../data/core/definitions';
import type { Automations, EditableAutomation } from '../../data/core/automations';
import type { AutomationRule } from '../../domain/activity';
export function AutomationCopy({rule,service,disabled}:{rule:AutomationRule;service:Automations;disabled:boolean}) {
 const client=useQueryClient(), task=useRef<AbortController|null>(null);
 const [id]=useState(()=>crypto.randomUUID()),[name,setName]=useState(''),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 useDraftGuard(!!name,busy);useEffect(()=>()=>task.current?.abort(),[]);
 async function copy(){
  if(task.current||attempted||!service.duplicate||!validName(name)||disabled)return;
  const c=new AbortController();task.current=c;setBusy(true);setError('');
  try{
   const base=await service.read(rule.id,c.signal);
   if(c.signal.aborted)return;
   if(!base.draft||base.revision!==rule.revision){setError('Правило изменилось или содержит неподдерживаемые поля. Обновите список; копия не создавалась.');return;}
   setAttempted(true);
   const saved:EditableAutomation=await service.duplicate(base,id,name,c.signal);
   if(c.signal.aborted)return;
   await client.cancelQueries({queryKey:['activity','automations']});if(c.signal.aborted)return;
   client.setQueryData<AutomationRule[]>(['activity','automations'],old=>[...(old??[]).filter(r=>r.id!==saved.id),saved]);
   setName('');setNotice(`Выключенная копия «${saved.name}» сохранена и проверена. У неё отдельная история. Измените её и включите отдельно, когда будете готовы.`);
  }catch(e){if(!c.signal.aborted)setError(definitionError(e));}
  finally{if(!c.signal.aborted)setBusy(false);if(task.current===c)task.current=null;}
 }
 if(!service.duplicate)return null;
 return <details className="definition-editor"><summary>Создать выключенную копию</summary><label>Название копии правила<input value={name} disabled={busy||attempted||disabled} onChange={e=>setName(e.target.value)}/></label><p className="quiet-note">Событие, условия и действия копируются без включения и без истории запусков. Исходное правило не меняется.</p><Button variant="secondary" disabled={busy||attempted||disabled||!validName(name)} onClick={()=>void copy()}>Создать выключенную копию</Button>{notice&&<p role="status">{notice}</p>}{error&&<p role="alert">{error}</p>}{attempted&&<p className="quiet-note">Повторная запись с новым идентификатором автоматически не выполняется. Если ответ потерян, проверьте список. Одно совпадение имени не подтверждает результат попытки.</p>}</details>;
}
