import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { useRuntime } from '../../app/runtime-context';
import { useDraftGuard } from '../../app/draft-guard-context';
import { Button } from '../../components/ui/button';
import { CoreError, coreErrorMessage } from '../../data/core/errors';
import { validName, definitionError } from '../../data/core/definitions';
import type { Metadata, MetadataKind, MetadataValue } from '../../data/core/metadata';
import { homeKey } from '../home/use-home';

type Option = { id: string; name: string };
type Props = { kind: MetadataKind; id: string; title: string; parents?: Option[] };
const labels = { house: 'дома', floor: 'этажа', room: 'комнаты', device: 'устройства' };
function MetadataForm({ service, original, parents }: { service: Metadata; original: MetadataValue; parents: Option[] }) {
  const repository = useRepository(), runtime = useRuntime(), client = useQueryClient();
  const [base, setBase] = useState(original), [name, setName] = useState(original.name), [parentId, setParentId] = useState(original.parentId);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [blocked, setBlocked] = useState(false);
  const [comparison, setComparison] = useState<MetadataValue | null>(null);
  const task = useRef<AbortController | null>(null);
  const dirty = name !== base.name || parentId !== base.parentId;
  const discard = useDraftGuard(dirty, busy);
  const moves = base.kind === 'room' || base.kind === 'device';
  const parentValid = !moves || parents.some(p => p.id === parentId);
  useEffect(() => () => task.current?.abort(), []);
  const reset = (value: MetadataValue) => { setBase(value); setName(value.name); setParentId(value.parentId); setComparison(null); setError(''); setBlocked(false); };
  async function save() {
    if (task.current || blocked || !dirty || !validName(name) || !parentValid) return;
    const current = new AbortController(); task.current = current; setBusy(true); setError(''); setNotice('');
    try {
      const saved = await service.save(base, { name, parentId }, current.signal);
      if (current.signal.aborted) return;
      reset(saved);
      await client.cancelQueries({ queryKey: ['metadata', base.kind, base.id] });
      if (current.signal.aborted) return;
      client.setQueryData(['metadata', base.kind, base.id], saved);
      if (saved.kind === 'house' && runtime.mode === 'core') await runtime.acceptVerifiedHouseName?.(saved.id, saved.name, current.signal);
      if (current.signal.aborted) return;
      setNotice('Изменения сохранены и прочитаны из Core.');
      // Cancel old snapshot responses before replacing the visible hierarchy. Never replay a write.
      try { await client.cancelQueries({ queryKey: homeKey }); const home = await repository.getHome(current.signal); if (!current.signal.aborted) client.setQueryData(homeKey, home); }
      catch { if (!current.signal.aborted) setNotice('Изменения сохранены и проверены. Список пока не обновился: обновите данные дома. Повторно сохранять не нужно.'); }
    } catch (e) { if (!current.signal.aborted) { setError(definitionError(e)); setBlocked(true); setComparison(null); } }
    finally { if (!current.signal.aborted) setBusy(false); if (task.current === current) task.current = null; }
  }
  async function compare() {
    if (task.current) return;
    const current = new AbortController(); task.current = current; setBusy(true);
    try { const value = await service.read(base.kind, base.id, current.signal); if (!current.signal.aborted) setComparison(value); }
    catch (e) { if (!current.signal.aborted) setError(coreErrorMessage(e)); }
    finally { if (!current.signal.aborted) setBusy(false); if (task.current === current) task.current = null; }
  }
  const parentName = (id: string | null) => parents.find(p => p.id === id)?.name ?? 'Размещение недоступно';
  return <><form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={busy}><legend>Название {labels[base.kind]}{moves ? ' и размещение' : ''}</legend>
    <label>Название<input value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
    {moves && <label>{base.kind === 'room' ? 'Этаж' : 'Комната'}<select value={parentId ?? ''} onChange={e => setParentId(e.target.value)}>{!parentValid && <option value={parentId ?? ''}>Текущее размещение недоступно</option>}{parents.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {moves && <p className="quiet-note">Перемещение только внутри этого дома. Состояние устройства не меняется, команды не отправляются.</p>}
    {!validName(name) && <p role="alert">Введите название от 1 до 255 символов.</p>}
    <div className="metadata-actions"><Button type="submit" disabled={!dirty || !validName(name) || !parentValid || blocked}>{busy ? 'Сохраняем…' : 'Сохранить изменения'}</Button><Button variant="quiet" disabled={!dirty || blocked} onClick={() => discard(() => reset(base))}>Отменить изменения</Button></div>
    </fieldset></form>{notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    {blocked && <><p className="quiet-note">Черновик сохранён. Прежде чем повторять запись, сравните его с актуальными данными. Сохранение могло уже выполниться.</p><Button variant="secondary" disabled={busy} onClick={() => void compare()}>Сравнить с Core</Button></>}
    {comparison && <aside className="metadata-comparison"><h3>Сравнение изменений</h3><p>В Core: «{comparison.name}»{moves ? ` · ${parentName(comparison.parentId)}` : ''}. Версия {comparison.revision ?? 'не поддерживается'}.</p><p>Ваш черновик: «{name}»{moves ? ` · ${parentName(parentId)}` : ''}.</p><div className="metadata-actions"><Button variant="secondary" disabled={busy} onClick={() => discard(() => reset(comparison))}>Принять данные Core</Button><Button variant="secondary" disabled={busy || !comparison.revision} onClick={() => { setBase(comparison); setComparison(null); setBlocked(false); setError(''); setNotice('Актуальная версия принята за основу. Проверьте черновик и отдельно сохраните изменения.'); }}>Сохранить черновик для новой версии</Button></div></aside>}
  </>;
}
function OpenEditor({ service, kind, id, parents = [] }: Props & { service: Metadata }) {
  const value = useQuery({ queryKey: ['metadata', kind, id], queryFn: ({ signal }) => service.read(kind, id, signal), retry: false, staleTime: 0 });
  const rights = useQuery({ queryKey: ['metadata-permissions'], queryFn: ({ signal }) => service.permissions(signal), retry: false, staleTime: 0 });
  if (value.isPending || rights.isPending) return <p role="status">Проверяем актуальные данные и права…</p>;
  if ((value.isError && (!value.data || (value.error instanceof CoreError && ['unauthorized', 'forbidden', 'not-found'].includes(value.error.kind)))) || (rights.isError && (!rights.data || (rights.error instanceof CoreError && ['unauthorized', 'forbidden', 'not-found'].includes(rights.error.kind))))) return <><p role="alert">{coreErrorMessage(value.error ?? rights.error)}</p><Button variant="secondary" onClick={() => { void value.refetch(); void rights.refetch(); }}>Повторить чтение</Button></>;
  if (!value.data || !rights.data) return <p role="alert">Данные недоступны. Повторите чтение позже.</p>;
  if (!value.data.revision) return <p>Этот Core не поддерживает защиту конфликтов названия и размещения. Просмотр доступен; для изменения нужна совместимая версия Core.</p>;
  if (!rights.data.includes('house.read') || !rights.data.includes(kind === 'device' ? 'device.manage' : 'house.manage')) return <p>Изменение недоступно: нужны права на управление {kind === 'device' ? 'устройствами' : 'домом'}. Данные не изменены.</p>;
  return <>{(value.isError || rights.isError) && <p role="alert">Не удалось обновить данные. Черновик сохранён; перед записью права и версия будут проверены повторно.</p>}<MetadataForm key={`${kind}:${id}`} service={service} original={value.data} parents={parents} /></>;
}
export function MetadataEditor(props: Props) {
  const service = useRepository().metadata;
  const [open, setOpen] = useState(false);
  if (!service) return null;
  return <section className="settings-panel definition-editor metadata-editor"><h2>{props.title}</h2>{!open ? <Button variant="secondary" onClick={() => setOpen(true)}>Изменить {labels[props.kind] === 'дома' ? 'название дома' : props.kind === 'floor' ? 'название этажа' : 'название и размещение'}</Button> : <OpenEditor {...props} service={service} />}</section>;
}
