import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { Button } from '../../components/ui/button';
import { definitionError, validName } from '../../data/core/definitions';
import type { DefinitionKind } from '../../data/core/definitions';
import type { HomeSnapshot } from '../../domain/home';
import { useDraftGuard } from '../../app/draft-guard-context';
import { homeKey } from '../home/use-home';

function useEditor(permission: string) {
  const repository = useRepository();
  const definitions = repository.definitions;
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false), [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const rights = useQuery({ queryKey: ['definition-permissions'], queryFn: ({ signal }) => definitions!.permissions(signal), enabled: !!definitions, retry: false });
  useEffect(() => () => { controller.current?.abort(); }, []);
  const allowed = !!rights.data?.includes(permission + '.manage') && !!rights.data?.includes(permission + '.read') && !rights.isError;
  async function save(operation: (signal: AbortSignal) => Promise<void>, done: () => void) {
    if (!allowed || controller.current) return;
    const current = new AbortController(); controller.current = current;
    setPending(true); setMessage(''); setError(false);
    try {
      await operation(current.signal);
      if (current.signal.aborted) return;
      setMessage('Сохранено и проверено в Core. Действия не запускались.'); done();
      void client.invalidateQueries({ queryKey: homeKey });
      void client.invalidateQueries({ queryKey: ['activity', 'automations'] });
    } catch (failure) {
      if (!current.signal.aborted) { setError(true); setMessage(definitionError(failure)); }
    } finally {
      if (!current.signal.aborted) setPending(false);
      if (controller.current === current) controller.current = null;
    }
  }
  async function refresh() {
    if (controller.current) return;
    const current = new AbortController(); controller.current = current; setPending(true);
    try {
      if (permission === 'scene') {
        const home = await repository.getHome(current.signal);
        if (!current.signal.aborted) client.setQueryData(homeKey, home);
      } else {
        const rules = await repository.activity!.automations(current.signal);
        if (!current.signal.aborted) client.setQueryData(['activity', 'automations'], rules);
      }
      if (!current.signal.aborted) { setError(false); setMessage('Список обновлён из Core. Черновик не изменён.'); }
    } catch {
      if (!current.signal.aborted) { setError(true); setMessage('Не удалось обновить список. Черновик остаётся в форме.'); }
    } finally {
      if (!current.signal.aborted) setPending(false);
      if (controller.current === current) controller.current = null;
    }
  }
  const notice = !definitions ? null : rights.isPending ? <p role="status">Проверяем права…</p>
    : rights.isError ? <p role="alert">Не удалось проверить права. <Button variant="quiet" onClick={() => void rights.refetch()}>Повторить проверку прав</Button></p>
    : !allowed ? <p className="quiet-note">Изменение доступно при наличии прав на чтение и управление.</p> : null;
  return { definitions, allowed, pending, save, notice, feedback: message && <><p role={error ? 'alert' : 'status'}>{message}</p>{error && <Button variant="secondary" disabled={pending} onClick={() => void refresh()}>Обновить список без сброса черновика</Button>}</> };
}

export function RenameDefinition({ kind, id, name, revision }: { kind: DefinitionKind; id: string; name: string; revision?: number | undefined }) {
  const editor = useEditor(kind === 'scenes' ? 'scene' : 'automation');
  const [editing, setEditing] = useState(false), [draft, setDraft] = useState(name), [original, setOriginal] = useState(name);
  const [originalRevision, setOriginalRevision] = useState(revision);
  const discard = useDraftGuard(!!editor.definitions && editing && draft !== original, editor.pending);
  if (!editor.definitions) return null;
  return <div className="definition-editor">{editor.notice}{revision === undefined && <p role="status">Core не предоставляет revision. Переименование недоступно до обновления Core.</p>}{editor.allowed && revision !== undefined && (!editing
    ? <Button variant="secondary" onClick={() => { setDraft(name); setOriginal(name); setOriginalRevision(revision); setEditing(true); }}>Изменить название</Button>
    : <form aria-label={`Название: ${name}`} onSubmit={e => { e.preventDefault(); if (validName(draft)) void editor.save(signal => editor.definitions!.rename(kind, id, original, draft, signal, originalRevision), () => setEditing(false)); }}>
      <fieldset disabled={editor.pending}><legend>Название</legend><label>Новое название<input autoFocus required maxLength={255} value={draft} onChange={e => setDraft(e.target.value)} /></label>
      <p className="quiet-note">Исходная версия: {originalRevision}. Текущая: {revision}; название в Core: {name}.</p>
      {revision !== originalRevision && <Button variant="secondary" onClick={() => { setOriginal(name); setOriginalRevision(revision); }}>Я сравнил изменения — использовать текущую версию</Button>}
      <p className="quiet-note">Остальные параметры сохраняются. Выполнение не запускается.</p><div className="definition-buttons"><Button type="submit" disabled={!validName(draft)}>{editor.pending ? 'Сохраняем…' : 'Сохранить название'}</Button><Button variant="quiet" onClick={() => discard(() => setEditing(false))}>Отмена</Button></div></fieldset>
    </form>)}{editor.feedback}</div>;
}

export function CreateScene({ home }: { home: HomeSnapshot }) {
  const editor = useEditor('scene');
  const formId = useId();
  const [open, setOpen] = useState(false), [name, setName] = useState('');
  const [id, setId] = useState(() => crypto.randomUUID());
  const [actions, setActions] = useState([{ deviceId: '', on: false }]);
  const dirty = name !== '' || actions.length !== 1 || actions[0]?.deviceId !== '' || actions[0]?.on !== false;
  const discard = useDraftGuard(!!editor.definitions && dirty, editor.pending);
  const clearDraft = () => { setOpen(false); setName(''); setActions([{ deviceId: '', on: false }]); setId(crypto.randomUUID()); };
  const devices = home.devices.filter(d => d.kind === 'relay' || d.kind === 'light');
  if (!editor.definitions) return null;
  return <section className="settings-panel definition-editor" aria-label="Создание сценария">{editor.notice}
    {editor.allowed && (!open ? <Button onClick={() => setOpen(true)}>{dirty ? 'Продолжить черновик' : 'Создать сценарий'}</Button> : <form onSubmit={e => {
      e.preventDefault(); if (!validName(name) || actions.some(a => !a.deviceId)) return;
      void editor.save(signal => editor.definitions!.createScene({ id, name, actions }, signal), clearDraft);
    }}><fieldset disabled={editor.pending}><legend>Новый сценарий</legend><label>Название сценария<input autoFocus required maxLength={255} value={name} onChange={e => setName(e.target.value)} /></label>
      <p>Сохраняется только описание действий. Устройства не переключаются.</p>
      {!devices.length && <p role="status">Нет доступных устройств с питанием ON/OFF. Создание пока недоступно.</p>}
      {actions.map((action, index) => <fieldset className="definition-action" key={index}><legend>Действие {index + 1}</legend>
        <label htmlFor={`${formId}-device-${index}`}>Устройство {index + 1}</label><select id={`${formId}-device-${index}`} required value={action.deviceId} onChange={e => setActions(rows => rows.map((a, i) => i === index ? { ...a, deviceId: e.target.value } : a))}><option value="">Выберите устройство</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name} · {home.rooms.find(r => r.id === d.roomId)?.name ?? d.roomId}</option>)}</select>
        <label htmlFor={`${formId}-power-${index}`}>Питание {index + 1}</label><select id={`${formId}-power-${index}`} value={String(action.on)} onChange={e => setActions(rows => rows.map((a, i) => i === index ? { ...a, on: e.target.value === 'true' } : a))}><option value="false">Выключить</option><option value="true">Включить</option></select>
        <Button variant="quiet" disabled={actions.length === 1} aria-label={`Удалить действие ${index + 1}`} onClick={() => setActions(rows => rows.filter((_, i) => i !== index))}>Убрать действие</Button>
      </fieldset>)}
      <div className="definition-buttons"><Button variant="secondary" disabled={actions.length >= 100} onClick={() => setActions(rows => [...rows, { deviceId: '', on: false }])}>Добавить действие</Button>
      <Button type="submit" disabled={!validName(name) || actions.some(a => !a.deviceId) || !devices.length}>{editor.pending ? 'Сохраняем…' : 'Сохранить сценарий'}</Button><Button variant="quiet" onClick={() => setOpen(false)}>Свернуть черновик</Button><Button variant="quiet" onClick={() => discard(clearDraft)}>Удалить черновик</Button></div>
      <p className="quiet-note">До 100 действий. Черновик хранится только в памяти. При уходе появится предупреждение; после подтверждённого ухода восстановить его нельзя.</p>
    </fieldset></form>)}{editor.feedback}
  </section>;
}
