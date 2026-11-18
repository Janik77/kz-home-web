import { Button } from '../../components/ui/button';
import { isDurableWait, validDurablePlan, waitExplanation, type DurableWait } from '../../data/core/durable';
export interface RelayDefinition { type:'device_state'; device_id:string; state:{on:boolean} }
export type PlanStep=RelayDefinition|DurableWait;
export function ActionPlanEditor({actions,onChange,devices,scene=false}:{actions:PlanStep[];onChange:(v:PlanStep[])=>void;devices:{id:string;name:string}[];scene?:boolean}) {
 const replace=(i:number,value:PlanStep)=>onChange(actions.map((a,index)=>index===i?value:a));
 return <>{actions.map((action,i)=><div className="definition-action" key={i}>{isDurableWait(action)?<><label>Пауза {i+1}: секунды<input type="number" min="1" max="3600" step="1" required value={Number.isFinite(action.seconds)?action.seconds:''} onChange={e=>replace(i,{type:'durable_wait',seconds:e.target.valueAsNumber})}/></label><p className="quiet-note">{waitExplanation}</p></>:<div className="automation-fields"><label>{scene?`Устройство ${i+1}`:`Действие ${i+1}: устройство`}<select required value={action.device_id} onChange={e=>replace(i,{...action,device_id:e.target.value})}><option value="">Выберите реле</option>{devices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label>{scene?`Питание ${i+1}`:`Действие ${i+1}: питание`}<select value={String(action.state.on)} onChange={e=>replace(i,{...action,state:{on:e.target.value==='true'}})}><option value="true">Включить</option><option value="false">Выключить</option></select></label></div>}
 <Button variant="quiet" disabled={actions.length===1} onClick={()=>onChange(actions.filter((_,index)=>index!==i))}>Удалить действие {i+1}</Button>
 {!isDurableWait(action)&&i<actions.length-1&&!isDurableWait(actions[i+1]!)&&<Button variant="secondary" disabled={actions.length>=16} onClick={()=>onChange([...actions.slice(0,i+1),{type:'durable_wait',seconds:5},...actions.slice(i+1)])}>Добавить паузу после шага {i+1}</Button>}</div>)}
 <Button variant="secondary" disabled={actions.length>=16} onClick={()=>onChange([...actions,{type:'device_state',device_id:'',state:{on:!scene}}])}>Добавить действие</Button>
 {!validDurablePlan(actions)&&<p role="alert">Пауза нужна между двумя действиями реле. Не больше 16 шагов, от 1 до 3600 секунд на паузу, суммарно до часа; без пауз подряд, в начале или конце.</p>}
 </>;
}
