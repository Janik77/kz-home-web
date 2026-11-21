import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useRepository } from '../../app/services';
import { useDraftGuard } from '../../app/draft-guard-context';
import { Button } from '../../components/ui/button';
import { validName } from '../../data/core/definitions';
import { CoreError, coreErrorMessage } from '../../data/core/errors';
import type { SoftwareClaim } from '../../data/core/software-onboarding';
import type { HomeSnapshot } from '../../domain/home';
import { homeKey } from '../home/use-home';

const label = { relay: 'Программное реле', temperature_sensor: 'Программный датчик температуры' };
const inactive = (error: unknown) => error instanceof CoreError && ['not-found', 'forbidden'].includes(error.kind);

export function AddSoftwareDevice({ home }: { home: HomeSnapshot }) {
  const formId = useId();
  const api = useRepository().softwareOnboarding;
  const client = useQueryClient();
  const key = ['software-device-candidates', home.house.id] as const;
  const candidates = useQuery({ queryKey: key, queryFn: ({ signal }) => api!.candidates(signal), enabled: !!api, retry: false });
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(''), [roomId, setRoomId] = useState(''), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [unknown, setUnknown] = useState<SoftwareClaim | null>(null);
  const [error, setError] = useState(''), [added, setAdded] = useState<SoftwareClaim | null>(null), [notice, setNotice] = useState('');
  const running = useRef<AbortController | null>(null);
  useEffect(() => () => running.current?.abort(), []);
  const discard = useDraftGuard(open && (!!name || !!selected || !!roomId || !!unknown), busy);
  if (!api || (!open && !added && !candidates.isSuccess)) return null;
  const candidate = candidates.data?.find(item => item.id === selected);
  function close() { setOpen(false); setSelected(''); setRoomId(''); setName(''); setUnknown(null); setError(''); setNotice(''); }
  async function run(checkOnly: boolean) {
    if (!api || running.current) return;
    const draft = checkOnly ? unknown : (!unknown && candidates.isSuccess && candidate && home.rooms.some(room => room.id === roomId) && validName(name))
      ? { ...candidate, roomId, name: name.trim() } : null;
    if (!draft) return;
    const task = new AbortController();
    running.current = task; setBusy(true); setError(''); setNotice('');
    try {
      const stored = checkOnly ? await api.check(draft, task.signal) : await api.claim(draft, task.signal);
      task.signal.throwIfAborted();
      if (!stored) {
        setUnknown(null);
        setNotice('Привязки пока нет. Проверьте данные и подтвердите добавление ещё раз.');
        return;
      }
      close(); setAdded(draft);
      void client.invalidateQueries({ queryKey: homeKey });
      void client.invalidateQueries({ queryKey: key });
    } catch (e) {
      if (task.signal.aborted) return;
      if (!checkOnly && !(e instanceof CoreError && ['forbidden', 'validation', 'not-found'].includes(e.kind))) setUnknown(draft);
      setError(checkOnly ? 'Не удалось сверить привязку. ' + coreErrorMessage(e)
        : 'Добавление не подтверждено. ' + coreErrorMessage(e));
    } finally {
      if (!task.signal.aborted) setBusy(false);
      if (running.current === task) running.current = null;
    }
  }
  return <section className="definition-editor space-create" aria-label="Добавление устройства">
    {!open && candidates.isSuccess && <Button onClick={() => { setAdded(null); setOpen(true); }}>Добавить устройство</Button>}
    {added && <p role="status">{added.name} добавлено. {added.type === 'relay' ? 'Управление появится после первого подтверждённого состояния.' : 'Показания появятся после первого измерения.'} <Link to={'/rooms/' + encodeURIComponent(added.roomId)}>Открыть комнату</Link></p>}
    {open && <form onSubmit={event => { event.preventDefault(); if (!unknown) void run(false); }}>
      <fieldset disabled={busy || !!unknown}>
        <legend>Тестовый стенд: программное устройство</legend>
        <p>Способ подключения: MQTT. Этот шаг не подключает физические устройства.</p>
        <label htmlFor={formId + "-device"}><span id={formId + "-device-label"}>Устройство</span><select id={formId + "-device"} aria-labelledby={formId + "-device-label"} required value={selected} onChange={event => setSelected(event.target.value)}>
          <option value="">Выберите устройство</option>{candidates.data?.map(item => <option key={item.id} value={item.id}>{label[item.type]} · {item.id}</option>)}
        </select></label>
        {candidates.isError && !inactive(candidates.error) && <p role="alert">Список устройств недоступен. <Button variant="quiet" onClick={() => void candidates.refetch()}>Обновить список</Button></p>}
        {candidates.isError && inactive(candidates.error) && <p role="alert">Добавление сейчас недоступно.</p>}
        {candidates.isSuccess && !candidates.data.length && <p>На этом стенде нет свободных программных устройств.</p>}
        <label htmlFor={formId + "-house"}><span id={formId + "-house-label"}>Дом</span><input id={formId + "-house"} aria-labelledby={formId + "-house-label"} readOnly value={home.house.name} /></label>
        <label htmlFor={formId + "-room"}><span id={formId + "-room-label"}>Комната</span><select id={formId + "-room"} aria-labelledby={formId + "-room-label"} required value={roomId} onChange={event => setRoomId(event.target.value)}>
          <option value="">Выберите комнату</option>{home.rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
        </select></label>
        {!home.rooms.length && <Link to="/rooms">Сначала добавьте комнату</Link>}
        <label htmlFor={formId + "-name"}><span id={formId + "-name-label"}>Название</span><input id={formId + "-name"} aria-labelledby={formId + "-name-label"} required maxLength={255} value={name} onChange={event => setName(event.target.value)} /></label>
      </fieldset>
      <div className="definition-buttons">
        {unknown ? <Button disabled={busy} onClick={() => void run(true)}>Проверить привязку</Button>
          : <Button type="submit" disabled={busy || !candidates.isSuccess || !candidate || !roomId || !validName(name)}>Подтвердить привязку</Button>}
        <Button variant="quiet" disabled={busy} onClick={() => discard(close)}>Закрыть</Button>
      </div>
      {busy && <p role="status">{unknown ? 'Проверяем привязку…' : 'Добавляем устройство…'}</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </form>}
  </section>;
}
