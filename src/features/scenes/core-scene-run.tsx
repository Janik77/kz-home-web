import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { Button } from '../../components/ui/button';
import { CoreError } from '../../data/core/errors';
import type { SceneRun, RunAction } from '../../data/core/scene-runs';
import type { Scene, HomeSnapshot } from '../../domain/home';
import { homeKey } from '../home/use-home';

const labels: Record<RunAction['status'], string> = {
  ready: 'Готово к отправке', waiting: 'Ожидает предыдущего действия', dispatch_unknown: 'Отправка неизвестна — повтора нет',
  blocked: 'Отправка заблокирована', skipped: 'Не отправлено', queued: 'Принято Core, результат ожидается',
  dispatched: 'Отправлено, ожидаем ACK и состояние', applied: 'Подтверждено ACK и состоянием', failed: 'Ошибка устройства', timed_out: 'Срок ожидания истёк, результат неизвестен',
};
const summaries: Record<SceneRun['status'], string> = { ready: 'Подготовлен, команды ещё не отправлены', running: 'Запуск начат', succeeded: 'Все действия подтверждены', stopped: 'Запуск остановлен', unknown: 'Результат неизвестен', expired: 'Срок отправки истёк' };
function errorMessage(error: unknown) {
  if (error instanceof CoreError) {
    if (error.kind === 'conflict') return 'Конфликт версии или состояния запуска. Обновите данные; автоматического повтора нет.';
    if (error.kind === 'forbidden') return 'Нет прав или Core запретил действие. Физические ограничения не обходятся.';
    if (error.kind === 'not-found') return 'Запуск не найден или эта версия Core не поддерживает подтверждённые запуски.';
    if (error.kind === 'validation') return 'Core отклонил сценарий. Поддерживаются только 1–16 действий программных реле с состоянием Вкл/Выкл.';
  }
  return 'Ответ не подтверждён. Команда могла быть отправлена. Обновите результат; повторной отправки не будет.';
}
export function CoreSceneRun({ scene, home }: { scene: Scene; home: HomeSnapshot }) {
  const service = useRepository().sceneRuns!;
  const client = useQueryClient();
  const [run, setRun] = useState<SceneRun | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [recoveryId, setRecoveryId] = useState('');
  const [attempted, setAttempted] = useState(false);
  const attempt = useRef<{ key: string; revision: number } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const rights = useQuery({ queryKey: ['scene-run-permissions'], queryFn: ({ signal }) => service.permissions(signal), retry: false });
  const allowed = ['scene.read', 'scene.run', 'device.read', 'device.control'].every(p => rights.data?.includes(p));
  useEffect(() => () => controller.current?.abort(), []);
  async function perform(operation: (signal: AbortSignal) => Promise<SceneRun>) {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setBusy(true); setError('');
    const accept = (value: SceneRun) => {
      if (value.scene_id !== scene.id) throw new CoreError('protocol');
      setRun(value); void client.invalidateQueries({ queryKey: homeKey });
    };
    try {
      let value = await operation(current.signal); current.signal.throwIfAborted(); accept(value);
      // Observe only. A later action always needs another explicit click.
      const end = Date.now() + 35_000;
      while (value.actions.some(a => ['queued', 'dispatched', 'dispatch_unknown'].includes(a.status)) && Date.now() < end) {
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
  const next = run?.actions.find(a => a.status === 'ready');
  return <section className="core-scene-run" aria-label={`Подтверждённый запуск: ${scene.name}`}>
    {!run && <>
      <p className="quiet-note">Только программные реле. Подготовка не отправляет команды; каждое действие запускается отдельно.</p>
      {rights.isPending ? <p role="status">Проверяем права запуска…</p> : rights.isError ? <p role="alert">Не удалось проверить права. <Button variant="quiet" onClick={() => void rights.refetch()}>Проверить права запуска</Button></p> : !allowed ? <p>Нет прав на запуск и управление устройствами.</p> : null}
      {scene.revision === undefined && <p>Core не предоставляет revision. Подготовка недоступна.</p>}
      <Button variant="secondary" disabled={busy || !allowed || scene.revision === undefined} onClick={() => {
        if (!attempt.current) attempt.current = { key: crypto.randomUUID(), revision: scene.revision! };
        const intent = attempt.current; setAttempted(true);
        void perform(signal => service.create(scene.id, intent.revision, intent.key, signal));
      }}>{busy ? 'Проверяем…' : attempted ? 'Проверить прежнюю подготовку' : 'Подготовить запуск'}</Button>
      <details><summary>Открыть сохранённый запуск по ID</summary><label>ID запуска<input value={recoveryId} onChange={event => setRecoveryId(event.target.value)} maxLength={128} /></label>
        <Button variant="secondary" disabled={busy || !recoveryId.trim()} onClick={() => void perform(signal => service.read(recoveryId.trim(), signal))}>Открыть результат</Button>
      </details>
    </>}
    {run && <>
      <p role="status">{run.status === 'ready' && run.actions.some(a => a.status === 'applied') ? 'Готов к следующему действию' : summaries[run.status]}. Подтверждено: {run.actions.filter(a => a.status === 'applied').length} из {run.actions.length}.</p>
      <p className="quiet-note">ID: <code>{run.id}</code> · версия {run.scene_revision}. Отправка до {new Date(run.dispatch_deadline).toLocaleString('ru-RU')}.</p>
      <ol>{run.actions.map(action => <li key={action.position}>
        <strong>{home.devices.find(d => d.id === action.device_id)?.name ?? action.device_id} · {action.requested_on ? 'Вкл' : 'Выкл'}</strong>
        <p>{labels[action.status]}</p>
        {action.receipt && <details><summary>Квитанция действия {action.position + 1}</summary><p>Команда: <code>{action.receipt.command_id}</code></p><p>Корреляция: <code>{action.receipt.correlation_id}</code></p></details>}
      </li>)}</ol>
      {next && ['ready', 'running'].includes(run.status) && <Button disabled={busy || !!error || !allowed} onClick={() => void perform(signal => service.dispatch(run, next.position, signal))}>Выполнить действие {next.position + 1}</Button>}
      <Button variant="secondary" disabled={busy} onClick={() => void perform(signal => service.read(run.id, signal, run))}>{busy ? 'Ожидаем подтверждение…' : 'Обновить результат'}</Button>
      <p className="quiet-note">Нет автоматического продолжения или отмены. Сохраните ID перед уходом. Истечение срока и неизвестный результат не означают, что устройство выключено.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
