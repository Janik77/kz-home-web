import {durableReason} from '../../data/core/durable';
import { WaitRunView } from '../definitions/wait-run-view';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { Button } from '../../components/ui/button';
import { CoreError, coreErrorMessage } from '../../data/core/errors';
import type { SceneRun, RunAction } from '../../data/core/scene-runs';
import type { Scene, HomeSnapshot } from '../../domain/home';
import type { RunReference } from '../../data/core/run-history';
import { SceneDetails } from './scene-details';
import { homeKey } from '../home/use-home';

const labels: Record<RunAction['status'], string> = {
  completed: 'Пауза завершена', cancelled: 'Оставшиеся шаги отменены', expired: 'Срок возобновления истёк', ready: 'Готово к отправке', waiting: 'Ожидает предыдущего действия', dispatch_unknown: 'Отправка неизвестна — повтора нет',
  blocked: 'Отправка заблокирована', skipped: 'Не отправлено', queued: 'Принято Core, результат ожидается',
  dispatched: 'Отправлено, ожидаем ACK и состояние', applied: 'Подтверждено ACK и состоянием', failed: 'Ошибка устройства', timed_out: 'Срок ожидания истёк, результат неизвестен',
};
const summaries: Record<SceneRun['status'], string> = { waiting:'Core сохраняет ожидание', cancelled:'Оставшиеся шаги отменены', ready: 'Ожидает исполнения Core', running: 'Core выполняет сценарий', succeeded: 'Все действия подтверждены', stopped: 'Запуск остановлен', partial: 'Выполнено частично', refused: 'В выполнении отказано', unknown: 'Результат неизвестен', expired: 'Срок отправки истёк' };
function errorMessage(error: unknown) {
  if (error instanceof CoreError) {
    if (error.kind === 'command-clock') return coreErrorMessage(error);
    if (error.kind === 'conflict') return 'Конфликт версии или состояния запуска. Для нового намерения выберите «Обновить сценарий для нового запуска». Автоматического повтора нет.';
    if (error.kind === 'forbidden') return 'Нет прав или Core запретил действие. Физические ограничения не обходятся.';
    if (error.kind === 'not-found') return 'Запуск не найден или эта версия Core не поддерживает серверный запуск. Новая команда не отправляется автоматически.';
    if (error.kind === 'validation') return 'Core отклонил сценарий. Поддерживаются только 1–16 действий программных реле с состоянием Вкл/Выкл.';
  }
  return 'Ответ не подтверждён. Команда могла быть отправлена. Обновите результат; повторной отправки не будет.';
}
const emptyHistory: readonly RunReference[] = [];
const noHistory = () => emptyHistory;
const noSubscribe = () => () => {};
export function CoreSceneRun({ scene, home }: { scene: Scene; home: HomeSnapshot }) {
  const repository = useRepository();
  const service = repository.sceneRuns!;
  const history = useSyncExternalStore(service.history?.subscribe ?? noSubscribe, service.history?.getSnapshot ?? noHistory);
  const client = useQueryClient();
  const [run, setRun] = useState<SceneRun | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [recoveryId, setRecoveryId] = useState('');
  const [confirmCancel,setConfirmCancel]=useState(false);
  const [attempted, setAttempted] = useState(!!service.intents?.get(scene.id));
  const [review, setReview] = useState<{ scene: Scene; home: HomeSnapshot } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const attempt = useRef(service.intents?.get(scene.id) ?? null);
  const controller = useRef<AbortController | null>(null);
  const rights = useQuery({ queryKey: ['scene-run-permissions'], queryFn: ({ signal }) => service.permissions(signal), retry: false });
  const allowed = ['scene.read', 'scene.run', 'device.read', 'device.control'].every(p => rights.data?.includes(p));
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(()=>{
    if(!run||!['waiting','ready','running'].includes(run.status)||busy)return;
    const task=new AbortController();
    const timer=setTimeout(()=>{void service.read(run.id,task.signal,run).then(value=>{if(!task.signal.aborted)setRun(value);}).catch(failure=>{if(!task.signal.aborted)setError(errorMessage(failure));});},3000);
    return ()=>{clearTimeout(timer);task.abort();};
  },[run,busy,service]);
  async function perform(operation: (signal: AbortSignal) => Promise<SceneRun>) {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setError('');
    const accept = (value: SceneRun) => {
      if (value.scene_id !== scene.id) throw new CoreError('protocol');
      service.history?.remember({ id: value.id, sceneId: value.scene_id, createdAt: value.created_at });
      setRun(value); setReview(null); void client.invalidateQueries({ queryKey: homeKey });
    };
    try {
      let value = await operation(current.signal); current.signal.throwIfAborted(); accept(value);
      // Observe only. Core owns execution; navigation never sends cancellation or another command.
      const end = Date.now() + 35_000;
      while (value.execution_mode === 'server' && ['ready', 'running'].includes(value.status) && Date.now() < end) {
        await new Promise<void>((resolve, reject) => {
          const done = () => { clearTimeout(timer); reject(current.signal.reason); };
          const timer = setTimeout(() => { current.signal.removeEventListener('abort', done); resolve(); }, 1000);
          current.signal.addEventListener('abort', done, { once: true });
        });
        current.signal.throwIfAborted(); value = await service.read(value.id, current.signal, value); current.signal.throwIfAborted(); accept(value);
      }
    } catch (failure) { if (!current.signal.aborted) setError(errorMessage(failure)); }
    finally { if (!current.signal.aborted) setBusy(false); if (controller.current === current) controller.current = null; }
  }
  async function reviewNewRun() {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setError(''); setReview(null); setAcknowledged(false);
    try {
      const fresh = await repository.getHome(current.signal); current.signal.throwIfAborted();
      const currentScene = fresh.scenes.find(s => s.id === scene.id);
      if (fresh.house.id !== home.house.id || !currentScene || currentScene.revision === undefined) throw new CoreError('not-found');
      if(currentScene.isDraft === true || currentScene.readActions?.some(a=>a.unsupported)) throw new CoreError('read-only');
      setReview({ scene: currentScene, home: fresh }); client.setQueryData(homeKey, fresh);
    } catch (failure) { if (!current.signal.aborted) setError(errorMessage(failure)); }
    finally { if (!current.signal.aborted) setBusy(false); if (controller.current === current) controller.current = null; }
  }
  const unsupported = scene.isDraft === true || !!scene.readActions?.some(a=>a.unsupported);
  const hasHistory = history.some(item => item.sceneId === scene.id);
  const canStartNew = run ? ['succeeded', 'stopped', 'expired', 'unknown', 'partial', 'refused', 'cancelled'].includes(run.status) : attempted || hasHistory;
  return <section className="core-scene-run" aria-label={`Подтверждённый запуск: ${scene.name}`}>
    {!run && !review && <>
      {hasHistory && <p>Есть недавние запуски этой сцены. Откройте результат из списка ниже или отдельно подготовьте новый.</p>}
      <p className="quiet-note">Только программные реле. Один запуск: Core проверяет все действия и выполняет их по порядку, ожидая подтверждения каждого. Если страница перезагружена после потери ответа, сначала откройте прежний запуск по ID: история сеанса не сохраняется.</p>
      {rights.isPending ? <p role="status">Проверяем права запуска…</p> : rights.isError ? <p role="alert">Не удалось проверить права. <Button variant="quiet" onClick={() => void rights.refetch()}>Проверить права запуска</Button></p> : !allowed ? <p>Нет прав на запуск и управление устройствами.</p> : null}
      {scene.isDraft === true ? <p role="status">Это черновик. Сначала отдельно подготовьте его к запуску; подготовка не переключает устройства.</p> : unsupported && <p role="status">План содержит неподдерживаемые действия или ограничения. Автоматического преобразования нет.</p>}
      {scene.revision === undefined && <p>Core не предоставляет revision. Запуск недоступен.</p>}
      {(!hasHistory || attempted) && <Button variant="secondary" disabled={busy || !allowed || scene.revision === undefined || unsupported} onClick={() => {
        if (controller.current) return;
        if (attempt.current) {
          const intent = attempt.current;
          void perform(signal => service.lookup(intent.key, signal));
          return;
        }
        const intent = { key: crypto.randomUUID(), revision: scene.revision! };
        attempt.current = intent; service.intents?.set(scene.id, intent); setAttempted(true);
        void perform(signal => service.create(scene.id, intent.revision, intent.key, signal));
      }}>{busy ? 'Проверяем…' : attempted ? 'Проверить прежний запуск' : 'Запустить сценарий'}</Button>}
      <details><summary>Открыть сохранённый запуск по ID</summary><label>ID запуска<input value={recoveryId} onChange={event => setRecoveryId(event.target.value)} maxLength={128} /></label>
        <Button variant="secondary" disabled={busy || !recoveryId.trim()} onClick={() => void perform(signal => service.read(recoveryId.trim(), signal))}>Открыть результат</Button>
      </details>
    </>}
    {run && <>
      {run.execution_mode === 'manual' && <p role="alert">Это прежний ручной запуск. Эта страница только читает его результат и не продолжает отправку.</p>}
      {run.execution_error && <p role="alert">Причина остановки Core: <span>{durableReason(run.execution_error) ?? run.execution_error}</span></p>}
      <p role="status">{summaries[run.status]}. Подтверждено: {run.actions.filter(a => a.status === 'applied').length} из {run.actions.filter(a => !('type' in a)).length}.</p>
      <p className="quiet-note">ID: <code>{run.id}</code> · версия {run.scene_revision}. Отправка до {new Date(run.dispatch_deadline).toLocaleString('ru-RU')}.</p>
      <ol>{run.actions.map(action => <li key={action.position}>
        {'type' in action ? <WaitRunView action={action}/> : <><strong>{home.devices.find(d => d.id === action.device_id)?.name ?? action.device_id} · {action.requested_on ? 'Вкл' : 'Выкл'}</strong></>}
        <p>{action.failure_code === 'publish_unconfirmed' ? 'Отправка не подтверждена — результат неизвестен' : labels[action.status]}{action.failure_code && <> · <span>{durableReason(action.failure_code) ?? action.failure_code}</span></>}</p>
        {action.receipt && <details><summary>Квитанция действия {action.position + 1}</summary><p>Команда: <code>{action.receipt.command_id}</code></p><p>Корреляция: <code>{action.receipt.correlation_id}</code></p></details>}
      </li>)}</ol>
      {run.status==='waiting'&&run.plan_deadline&&service.cancel&&allowed&&<><Button variant="secondary" disabled={busy} onClick={()=>setConfirmCancel(true)}>Отменить оставшиеся шаги</Button>{confirmCancel&&<div role="group" aria-label="Отмена оставшихся шагов"><p>Уже подтверждённое действие не отменится. Если Core уже начал следующий шаг, отмена может быть отклонена; прочитайте актуальный результат.</p><Button disabled={busy} onClick={()=>{setConfirmCancel(false);void perform(async signal=>{try{return await service.cancel!(run,signal);}catch(failure){try{const fresh=await service.read(run.id,signal,run);signal.throwIfAborted();setRun(fresh);}catch{/* Keep the original cancellation failure; no retry. */}throw failure;}});}}>Подтвердить отмену оставшихся шагов</Button><Button variant="quiet" onClick={()=>setConfirmCancel(false)}>Продолжить ожидание</Button></div>}</>}
      <Button variant="secondary" disabled={busy} onClick={() => void perform(signal => service.read(run.id, signal, run))}>{busy ? 'Ожидаем подтверждение…' : 'Обновить результат'}</Button>
      <p className="quiet-note">Серверный запуск продолжает Core, даже если закрыть страницу. Автоматического повтора или отмены нет. Во время сохранённой паузы оставшиеся шаги можно отменить явно; отправленные команды не отзываются. ID доступен в недавних запусках этого сеанса. Истечение срока и неизвестный результат не означают, что устройство выключено.</p>
    </>}
    {canStartNew && !review && <Button variant="secondary" disabled={busy || !allowed || unsupported} onClick={() => void reviewNewRun()}>Обновить сценарий для нового запуска</Button>}
    {review && <div className="run-review" aria-label="Новая подготовка">
      <h4>Новый запуск: {review.scene.name}</h4><p>Актуальная версия: {review.scene.revision}. Предыдущий запуск не изменится. Нажатие «Запустить новый сценарий» отправит все разрешённые действия через Core.</p>
      <SceneDetails scene={review.scene} home={review.home} />
      <p className="quiet-note">История ограничена 20 ID текущего дома и сеанса и очищается при перезагрузке, выходе или смене контекста. Успех выбранного запуска и отсутствие неизвестных результатов в этом списке не доказывают безопасность нового запуска.</p>
      <label className="run-acknowledgement"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />Понимаю: история неполна, результаты других запусков могут быть неизвестны. Новый запуск — отдельное намерение, не повтор команды.</label>
      <div className="definition-buttons"><Button disabled={busy || !allowed || !acknowledged || unsupported || review.scene.isDraft === true || !!review.scene.readActions?.some(a=>a.unsupported)} onClick={() => {
        if (controller.current) return;
        const intent = { key: crypto.randomUUID(), revision: review.scene.revision! }; attempt.current = intent; service.intents?.set(scene.id, intent);
        setAttempted(true); setRun(null); setReview(null);
        void perform(signal => service.create(scene.id, intent.revision, intent.key, signal));
      }}>Запустить новый сценарий</Button><Button variant="quiet" disabled={busy} onClick={() => setReview(null)}>Отмена подготовки</Button></div>
    </div>}
    {hasHistory && <details className="run-history"><summary>Недавние запуски этой сцены</summary>
      <p className="quiet-note">До 20 ID в памяти текущего дома и сеанса. Переходы по страницам сохраняют список; смена дома, выход и перезагрузка очищают его. Открытие только читает результат из Core.</p>
      <ul>{history.filter(item => item.sceneId === scene.id).map(item => <li key={item.id}><Button variant="quiet" disabled={busy} onClick={() => void perform(signal => service.read(item.id, signal))}>Открыть запуск {item.id}</Button><span className="quiet-note">{new Date(item.createdAt).toLocaleString('ru-RU')}</span></li>)}</ul>
    </details>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
