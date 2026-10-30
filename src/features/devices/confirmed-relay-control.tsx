import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import type { Device } from '../../domain/home';
import { CoreError } from '../../data/core/errors';
import type { Receipt } from '../../data/core/relay-control';
import { homeKey } from '../home/use-home';
import { Button } from '../../components/ui/button';

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
export function ConfirmedRelayControl({ device }: { device: Device }) {
  const repository = useRepository();
  const control = repository.relayControl;
  const client = useQueryClient();
  const eligibility = useQuery({ queryKey: ['relay-eligibility'], queryFn: ({ signal }) => control!.eligible(signal), enabled: !!control, retry: false, staleTime: 0 });
  const running = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => () => { running.current?.abort(); }, [device.id, control]);
  if (!control) return null;
  const allowed = device.connection === 'online' && eligibility.data?.includes(device.id) === true && !eligibility.isError;
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
          const home = await repository.getHome(controller.signal);
          if (!controller.signal.aborted) { client.setQueryData(homeKey, home); setStatus('Выполнено · данные Core обновлены'); }
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
    <p className="device-card__footnote">Core · Подтверждаемое управление реле</p>
    <Button variant="quiet" disabled={!allowed || busy} onClick={() => void run(true)}>Включить</Button>
    <Button variant="quiet" disabled={!allowed || busy} onClick={() => void run(false)}>Выключить</Button>
    {!allowed && <p className="device-card__footnote">Управление недоступно: нужны поддерживаемое реле в сети и подтверждённые права владельца дома.</p>}
    {status && <p role="status">{status}</p>}
    {status.startsWith('Нет подтверждения') && <p className="device-card__footnote">Команда могла выполниться. Повторное нажатие создаст новую команду; автоматической отправки нет.</p>}
  </div>;
}
