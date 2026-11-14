import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import type { Device } from '../../domain/home';
import { CoreError } from '../../data/core/errors';
import type { Receipt } from '../../data/core/relay-control';
import { homeKey } from '../home/use-home';
import { Button } from '../../components/ui/button';

const refreshKey = ['home', 'command-refresh'] as const;

function message(r: Receipt) {
  if (r.status === 'applied') return 'Выполнено';
  if (r.status === 'timed_out' || r.failure_code === 'publish_unconfirmed') return 'Нет подтверждения — состояние неизвестно';
  if (r.status === 'failed') return 'Не удалось выполнить';
  return r.status === 'queued' ? 'Ожидаем подтверждение · в очереди' : 'Ожидаем подтверждение';
}
function errorMessage(error: unknown) {
  if (!(error instanceof CoreError)) return 'Нет подтверждения — состояние неизвестно';
  switch (error.kind) {
    case 'forbidden': return 'Недостаточно подтверждённых прав для управления';
    case 'unauthorized': return 'Сессия истекла';
    case 'not-found': return 'Устройство или команда недоступны';
    case 'conflict': return 'Команда не принята: устройство занято, недоступно или изменилось';
    case 'validation': return 'Команда не поддерживается';
    case 'rate-limit': return 'Слишком много запросов. Повторная отправка не выполнена';
    default: return 'Нет подтверждения — состояние неизвестно';
  }
}
export function ConfirmedRelayControl({ device, everyday = false, explicitPower = false }: { device: Device; everyday?: boolean; explicitPower?: boolean }) {
  const repository = useRepository();
  const control = repository.relayControl;
  const client = useQueryClient();
  const eligibility = useQuery({ queryKey: ['relay-eligibility'], queryFn: ({ signal }) => control!.eligible(signal), enabled: !!control, retry: false, staleTime: 0 });
  const running = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => () => { running.current?.abort(); }, [device.id, control]);
  if (!control) return null;
  if (everyday && device.kind !== 'relay' && device.kind !== 'light') return <p className="device-card__footnote">Для этого типа или неизвестного состояния нет поддержанного управления Web.</p>;
  const allowed = device.connection === 'online' && eligibility.data?.includes(device.id) === true && !eligibility.isError && !eligibility.isFetching;
  const run = async (on: boolean) => {
    if (running.current || !allowed) return;
    const controller = new AbortController(); running.current = controller;
    let received = false;
    setBusy(true); setStatus('Отправляем команду');
    try {
      const receipt = await control.run(device.id, on, r => { received = true; if (!controller.signal.aborted) setStatus(message(r)); }, controller.signal);
      if (controller.signal.aborted) return;
      setStatus(message(receipt));
      if (receipt.status === 'applied') {
        try {
          await client.cancelQueries({ queryKey: homeKey });
          await client.cancelQueries({ queryKey: refreshKey });
          const home = await client.fetchQuery({ queryKey: refreshKey, staleTime: 0,
            queryFn: ({ signal }) => repository.getHome(AbortSignal.any([signal, controller.signal])) });
          if (!controller.signal.aborted) { client.setQueryData(homeKey, home); setStatus(everyday ? 'Выполнено · состояние обновлено' : 'Выполнено · данные Core обновлены'); }
        } catch { if (!controller.signal.aborted) setStatus('Выполнено · состояние не обновлено, показаны последние известные данные'); }
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const detail = errorMessage(error);
        setStatus(received && !detail.startsWith('Нет подтверждения') ? `Нет подтверждения — состояние неизвестно. ${detail}` : detail);
        void client.invalidateQueries({ queryKey: ['relay-eligibility'] });
      }
    } finally {
      if (!controller.signal.aborted) { running.current = null; setBusy(false); }
    }
  };
  return <div lang="ru">
    {!everyday && <p className="device-card__footnote">Core · Подтверждаемое управление реле</p>}
    {everyday && !explicitPower && (device.kind === 'relay' || device.kind === 'light') ? <Button className="everyday-power" disabled={!allowed || busy} onClick={() => void run(!device.on)}>{busy ? 'Команда выполняется' : device.on ? 'Выключить' : 'Включить'}</Button> : <><Button variant="quiet" disabled={!allowed || busy} onClick={() => void run(true)}>Включить</Button><Button variant="quiet" disabled={!allowed || busy} onClick={() => void run(false)}>Выключить</Button></>}
    {!allowed && <p className="device-card__footnote">{device.connection === 'offline' ? 'Устройство не в сети' : eligibility.isFetching ? 'Проверяем права на управление' : everyday ? 'Управление недоступно. Проверьте доступ и связь в настройках.' : 'Управление недоступно: нужны поддерживаемое реле в сети и подтверждённые права на управление и чтение результата.'}</p>}
    {status && <p role="status" className={busy || status === 'Выполнено' || status.startsWith('Выполнено · состояние обновлено') || status === 'Выполнено · данные Core обновлены' ? 'command-success' : undefined}>{status}</p>}
    {status.startsWith('Нет подтверждения') && <p className="device-card__footnote">Команда могла выполниться. Повторное нажатие создаст новую команду; автоматической отправки нет.</p>}
  </div>;
}
