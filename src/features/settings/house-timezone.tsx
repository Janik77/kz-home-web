import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { useDraftGuard } from '../../app/draft-guard-context';
import { Button } from '../../components/ui/button';
import { coreErrorMessage } from '../../data/core/errors';
import { definitionError } from '../../data/core/definitions';
import { validTimezone, type HouseClock, type HouseTimezone } from '../../data/core/schedules';

function TimezoneForm({ service, original }: { service: HouseClock; original: HouseTimezone }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState(original.timezone ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [base, setBase] = useState(original), [comparison, setComparison] = useState<HouseTimezone | null>(null);
  const controller = useRef<AbortController | null>(null);
  const discard = useDraftGuard(draft !== (base.timezone ?? ''), busy);
  useEffect(() => () => controller.current?.abort(), []);
  async function save() {
    if (controller.current || (draft && !validTimezone(draft))) return;
    const task = new AbortController(); controller.current = task; setBusy(true); setError(''); setNotice('');
    try { const saved = await service.save(draft || null, base.revision, task.signal); if (!task.signal.aborted) { await client.cancelQueries({ queryKey: ['house-clock'] }); client.setQueryData(['house-clock'], saved); setBase(saved); setDraft(saved.timezone ?? ''); setComparison(null); setNotice('Часовой пояс сохранён и прочитан из Core.'); } }
    catch (e) { if (!task.signal.aborted) setError(definitionError(e)); }
    finally { if (!task.signal.aborted) setBusy(false); if (controller.current === task) controller.current = null; }
  }
  async function compare() {
    if (controller.current) return;
    const task = new AbortController(); controller.current = task; setBusy(true);
    try { const value = await service.read(task.signal); if (!task.signal.aborted) setComparison(value); }
    catch (e) { if (!task.signal.aborted) setError(coreErrorMessage(e)); }
    finally { if (!task.signal.aborted) setBusy(false); if (controller.current === task) controller.current = null; }
  }
  return <><form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy}><legend>Часовой пояс дома</legend>
    <label>Часовой пояс (IANA)<input list="house-timezones" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Например, Asia/Almaty" autoComplete="off" /></label>
    <datalist id="house-timezones"><option value="Asia/Almaty" /><option value="Asia/Aqtau" /><option value="Asia/Aqtobe" /><option value="Asia/Atyrau" /><option value="Asia/Oral" /><option value="Asia/Qostanay" /><option value="Asia/Qyzylorda" /><option value="UTC" /></datalist>
    <p className="quiet-note">Выберите явно. Часовой пояс браузера или сервера не подставляется. Изменение влияет на все расписания дома. Пустое значение отключает выполнение расписаний, но сохраняет их определения.</p>
    {draft && !validTimezone(draft) && <p role="alert">Введите корректное имя часового пояса IANA.</p>}
    <Button type="submit" disabled={draft === (base.timezone ?? '') || (!!draft && !validTimezone(draft))}>{busy ? 'Сохраняем…' : 'Сохранить часовой пояс'}</Button>
    <Button variant="quiet" disabled={draft === (base.timezone ?? '')} onClick={() => discard(() => { setDraft(base.timezone ?? ''); setError(''); })}>Отменить изменения</Button>
    <p className="quiet-note">Версия настроек времени: {base.revision}. Сохранение не запускает текущую минуту и не догоняет пропущенные запуски.</p>
    </fieldset></form>{notice && <p role="status">{notice}</p>}{error && <><p role="alert">{error}</p><Button variant="secondary" disabled={busy} onClick={() => void compare()}>Сравнить часовой пояс с Core</Button></>}
    {comparison && <aside><p>В Core: {comparison.timezone ?? 'не выбран'}, версия {comparison.revision}. Ваш черновик сохранён, автоматической перезаписи нет.</p><Button variant="secondary" disabled={busy} onClick={() => discard(() => { setBase(comparison); setDraft(comparison.timezone ?? ''); setComparison(null); setError(''); })}>Отбросить черновик и принять Core</Button></aside>}</>;
}

export function HouseTimezoneSettings() {
  const service = useRepository().houseClock;
  const read = useQuery({ queryKey: ['house-clock'], queryFn: ({ signal }) => service!.read(signal), enabled: !!service, retry: false });
  const rights = useQuery({ queryKey: ['house-clock-permissions'], queryFn: ({ signal }) => service!.permissions(signal), enabled: !!service, retry: false });
  if (!service) return null;
  return <section className="settings-panel definition-editor"><h2>Время и расписания</h2>{read.isPending || rights.isPending ? <p role="status">Проверяем настройки времени и права…</p> : read.isError || rights.isError ? <><p role="alert">Настройки времени недоступны. {coreErrorMessage(read.error ?? rights.error)}</p><Button variant="secondary" onClick={() => { void read.refetch(); void rights.refetch(); }}>Повторить чтение настроек времени</Button></> : rights.data.includes('house.manage') ? <TimezoneForm service={service} original={read.data} /> : <p>Часовой пояс дома: {read.data.timezone ?? 'не выбран'}. Изменение доступно управляющему домом.</p>}</section>;
}
