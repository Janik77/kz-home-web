import { RenameDefinition } from '../definitions/definition-forms';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { useDraftGuard } from '../../app/draft-guard-context';
import { Button } from '../../components/ui/button';
import { StatePanel } from '../../components/ui/state-panel';
import { automationErrors, supportsRelay, type AutomationDraft, type Automations, type AutomationCheck, type AutomationRun, type EditableAutomation, type StateTest } from '../../data/core/automations';
import type { CoreDevice } from '../../data/core/dtos';
import type { AutomationRule } from '../../domain/activity';
import { definitionError } from '../../data/core/definitions';
import { coreErrorMessage } from '../../data/core/errors';

const stateTest = (): StateTest => ({ type: 'device_state', device_id: '', field: 'on', operator: 'eq', value: true });
const blank = (): AutomationDraft => ({ id: crypto.randomUUID(), name: '', trigger: stateTest(), conditions: [], actions: [{ type: 'device_state', device_id: '', state: { on: true } }] });
const runLabels: Record<AutomationRun['status'], string> = { ready: 'Подготовлено', running: 'Ожидаем подтверждения устройств', succeeded: 'Выполнено: ACK и состояние подтверждены', stopped: 'Выполнение остановлено', unknown: 'Исход неизвестен', expired: 'Срок истёк, исход может быть неизвестен', partial: 'Выполнено частично', refused: 'Отказ до выполнения', skipped: 'Пропущено' };
const actionLabels = { ready: 'Ещё не отправлено', waiting: 'Ожидает отправки', dispatch_unknown: 'Отправка не подтверждена, исход неизвестен', blocked: 'Отказ', skipped: 'Не выполнялось', queued: 'В очереди, не подтверждено', dispatched: 'Отправлено, ждём ACK и состояние', applied: 'Подтверждено: ACK и состояние', failed: 'Устройство отказало', timed_out: 'Нет подтверждения в срок, исход неизвестен' };
const issueLabels: Record<string, string> = { authorization_required: 'Для выполнения требуется подтверждённый владелец правила', authorization_revoked: 'Права владельца правила отозваны', transport_unavailable: 'MQTT недоступен', state_unavailable: 'Нет связи или актуального состояния устройства', unsupported_definition: 'Состав правила пока не поддерживается исполнителем', destination_not_allowed: 'Устройство не разрешено для программного стенда', device_unavailable: 'Устройство недоступно в этом доме', preflight_refused: 'Предварительная проверка отклонила выполнение', rule_disabled: 'Правило выключено', conditions_not_met: 'Дополнительные условия не совпадают', trigger_not_met: 'Текущее состояние не соответствует событию', device_offline: 'Устройство не в сети', state_stale: 'Состояние устарело', unsupported_rule: 'Это правило выходит за поддерживаемый объём', permission_denied: 'Недостаточно прав' };

function describeRule(text: string, devices: CoreDevice[]) {
  const device = devices.find(d => text.startsWith(`${d.id} · `));
  const value = device ? `${device.name}${text.slice(device.id.length)}` : text;
  return value.replace(' · on = true', ' · питание включено').replace(' · on = false', ' · питание выключено')
    .replace(' · on ≠ true', ' · питание не включено').replace(' · on ≠ false', ' · питание не выключено')
    .replace(' · {"on":true}', ' · включить').replace(' · {"on":false}', ' · выключить');
}

function StateFields({ label, value, onChange, devices }: { label: string; value: StateTest; onChange: (v: StateTest) => void; devices: CoreDevice[] }) {
  return <div className="automation-fields"><label>{label}: устройство<select required value={value.device_id} onChange={e => onChange({ ...value, device_id: e.target.value })}><option value="">Выберите реле</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name}{d.online ? '' : ' · не в сети'}</option>)}</select></label>
    <label>{label}: сравнение<select value={value.operator} onChange={e => onChange({ ...value, operator: e.target.value as 'eq' | 'neq' })}><option value="eq">Равно</option><option value="neq">Не равно</option></select></label>
    <label>{label}: питание<select value={String(value.value)} onChange={e => onChange({ ...value, value: e.target.value === 'true' })}><option value="true">Включено</option><option value="false">Выключено</option></select></label></div>;
}

function AutomationEditor({ service, initial, devices, onClose, onSaved }: { service: Automations; initial: EditableAutomation | null; devices: CoreDevice[]; onClose: () => void; onSaved: () => void }) {
  const [original] = useState(() => initial?.draft ?? blank());
  const [draft, setDraft] = useState<AutomationDraft>(original), [pending, setPending] = useState(false), [error, setError] = useState('');
  const [current, setCurrent] = useState<EditableAutomation | null>(null);
  const controller = useRef<AbortController | null>(null);
  const discard = useDraftGuard(JSON.stringify(draft) !== JSON.stringify(original), pending);
  useEffect(() => () => controller.current?.abort(), []);
  const errors = automationErrors(draft, devices), available = devices.filter(supportsRelay);
  async function save() {
    if (controller.current || errors.length) return;
    const task = new AbortController(); controller.current = task; setPending(true); setError('');
    try { await service.save(draft, initial?.revision, task.signal); if (!task.signal.aborted) onSaved(); }
    catch (e) { if (!task.signal.aborted) setError(definitionError(e)); }
    finally { if (!task.signal.aborted) setPending(false); if (controller.current === task) controller.current = null; }
  }
  async function compare() {
    if (!initial || controller.current) return;
    const task = new AbortController(); controller.current = task; setPending(true);
    try { const rule = await service.read(initial.id, task.signal); if (!task.signal.aborted) setCurrent(rule); }
    catch (e) { if (!task.signal.aborted) setError(coreErrorMessage(e)); }
    finally { if (!task.signal.aborted) setPending(false); if (controller.current === task) controller.current = null; }
  }
  return <section className="settings-panel definition-editor automation-editor" aria-label="Редактор автоматизации"><form onSubmit={e => { e.preventDefault(); void save(); }}><fieldset disabled={pending}><legend>{initial ? 'Редактировать правило' : 'Новое правило'}</legend>
    <label>Название правила<input autoFocus required maxLength={255} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
    <p className="quiet-note">{initial?.enabled ? 'Правило сейчас включено. После сохранения новые события используют обновлённые условия.' : 'Сохранение не отправляет команды. Новое правило создаётся выключенным; включение — отдельное действие.'}</p>
    {!available.length && <p role="status">В этом доме нет реле с поддержкой ON/OFF. Другие типы устройств не подменяются демонстрационным управлением.</p>}
    <fieldset className="definition-action"><legend>Когда</legend><p>Изменилось состояние устройства и новое значение соответствует:</p><StateFields label="Событие" value={draft.trigger} onChange={trigger => setDraft({ ...draft, trigger })} devices={available} /></fieldset>
    <fieldset className="definition-action"><legend>При условиях</legend><p className="quiet-note">Все условия должны совпасть. Без условий достаточно события.</p>{draft.conditions.map((condition, i) => <div key={i}><StateFields label={`Условие ${i + 1}`} value={condition} onChange={value => setDraft({ ...draft, conditions: draft.conditions.map((c, index) => index === i ? value : c) })} devices={available} /><Button variant="quiet" onClick={() => setDraft({ ...draft, conditions: draft.conditions.filter((_, index) => i !== index) })}>Удалить условие {i + 1}</Button></div>)}<Button variant="secondary" disabled={draft.conditions.length >= 50} onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, stateTest()] })}>Добавить условие</Button></fieldset>
    <fieldset className="definition-action"><legend>Выполнить</legend>{draft.actions.map((action, i) => <div className="automation-action" key={i}><div className="automation-fields"><label>Действие {i + 1}: устройство<select required value={action.device_id} onChange={e => setDraft({ ...draft, actions: draft.actions.map((a, index) => index === i ? { ...a, device_id: e.target.value } : a) })}><option value="">Выберите реле</option>{available.map(d => <option key={d.id} value={d.id}>{d.name}{d.online ? '' : ' · не в сети'}</option>)}</select></label><label>Действие {i + 1}: питание<select value={String(action.state.on)} onChange={e => setDraft({ ...draft, actions: draft.actions.map((a, index) => index === i ? { ...a, state: { on: e.target.value === 'true' } } : a) })}><option value="true">Включить</option><option value="false">Выключить</option></select></label></div><Button variant="quiet" disabled={draft.actions.length === 1} onClick={() => setDraft({ ...draft, actions: draft.actions.filter((_, index) => i !== index) })}>Удалить действие {i + 1}</Button></div>)}<Button variant="secondary" disabled={draft.actions.length >= 16} onClick={() => setDraft({ ...draft, actions: [...draft.actions, { type: 'device_state', device_id: '', state: { on: true } }] })}>Добавить действие</Button></fieldset>
    {errors.length > 0 && <ul className="quiet-note" aria-label="Проверка черновика">{errors.map(e => <li key={e}>{e}</li>)}</ul>}
    <div className="definition-buttons"><Button type="submit" disabled={errors.length > 0}>{pending ? 'Сохраняем…' : 'Сохранить правило'}</Button><Button variant="quiet" onClick={() => discard(onClose)}>Отмена</Button></div>
    <p className="quiet-note">Черновик хранится в памяти этой страницы. Уход и обновление страницы требуют подтверждения; после закрытия он не восстанавливается. {initial && `Исходная версия: ${initial.revision ?? 'неизвестна'}.`}</p>
  </fieldset></form>{error && <><p role="alert">{error}</p>{initial && <Button variant="secondary" disabled={pending} onClick={() => void compare()}>Сравнить с версией Core</Button>}</>}
    {current && <aside className="automation-comparison"><h3>Сейчас в Core: версия {current.revision}</h3><p>{current.name} · {current.enabled ? 'Включено' : 'Выключено'}</p><p>{current.trigger}</p><ul>{current.conditions.map((c, i) => <li key={i}>{c}</li>)}{current.actions.map((a, i) => <li key={i}>{a}</li>)}</ul><p>Ваш черновик выше не изменён. Автоматической перезаписи или повторного запроса нет. Чтобы начать с новой версии, закройте черновик и откройте редактирование снова.</p></aside>}
  </section>;
}

function RunHistory({ service, rule, devices }: { service: Automations; rule: AutomationRule; devices: CoreDevice[] }) {
  const query = useQuery({ queryKey: ['automation-runs', rule.id], queryFn: ({ signal }) => service.runs(rule.id, signal), retry: false, refetchInterval: 3000, refetchIntervalInBackground: false });
  if (query.isPending) return <p role="status">Загружаем историю запусков…</p>;
  if (query.isError) return <p role="alert">История недоступна. {coreErrorMessage(query.error)} <Button variant="quiet" onClick={() => void query.refetch()}>Повторить чтение истории</Button></p>;
  return <section className="automation-history" aria-label={`Запуски: ${rule.name}`}><h3>Последние запуски</h3><p className="quiet-note">До 20 запусков из Core. Обновляется каждые 3 секунды, пока страница видима. Чтение ничего не запускает.</p>{!query.data.length ? <p>Запусков пока нет. Включённое правило ожидает новое событие устройства.</p> : query.data.map((run, i) => <details key={run.id} open={i === 0}><summary>{runLabels[run.status]} · {new Date(run.created_at).toLocaleString('ru-RU')}</summary><p className="quiet-note">Версия правила: {run.automation_revision} · ID: {run.id}</p>{run.execution_error && <p role="status">Причина: <code>{run.execution_error}</code></p>}<ol>{run.actions.map(action => <li key={action.position}><strong>{devices.find(d => d.id === action.device_id)?.name ?? action.device_id} · {action.requested_on ? 'Включить' : 'Выключить'}</strong><p>{action.failure_code === 'publish_unconfirmed' ? 'Отправка не подтверждена, исход неизвестен' : actionLabels[action.status]}{action.failure_code && <> · <code>{action.failure_code}</code></>}</p></li>)}</ol></details>)}<p className="quiet-note">Отправка не означает выполнение. Неизвестный исход не повторяется автоматически и не доказывает, что устройство выключено.</p></section>;
}

function RuleTools({ rule, service, devices, allowed, busyEditor, onEdit }: { rule: AutomationRule; service: Automations; devices: CoreDevice[]; allowed: boolean; busyEditor: boolean; onEdit: (r: EditableAutomation) => void }) {
  const client = useQueryClient(), controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [check, setCheck] = useState<AutomationCheck | null>(null), [history, setHistory] = useState(false), [confirmEnable, setConfirmEnable] = useState<number | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function perform(operation: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const task = new AbortController(); controller.current = task; setBusy(true); setError('');
    try { await operation(task.signal); }
    catch (e) { if (!task.signal.aborted) setError(definitionError(e)); }
    finally { if (!task.signal.aborted) setBusy(false); if (controller.current === task) controller.current = null; }
  }
  async function toggle(signal: AbortSignal, enabled: boolean, expectedRevision: number) {
    await service.toggle(rule.id, enabled, expectedRevision, signal);
    if (!signal.aborted) { setConfirmEnable(null); setCheck(null); await client.invalidateQueries({ queryKey: ['activity', 'automations'] }); }
  }
  return <div className="automation-tools"><div className="definition-buttons">{allowed && rule.revision !== undefined && <><Button variant="secondary" disabled={busy || busyEditor} onClick={() => void perform(async signal => { const current = await service.read(rule.id, signal); if (signal.aborted) return; if (!current.draft) { setError('Это правило использует неподдерживаемые редактором условия или действия. Оно сохранено без изменений.'); return; } onEdit(current); })}>Редактировать правило</Button><Button variant="secondary" disabled={busy} onClick={() => rule.enabled ? void perform(signal => toggle(signal, false, rule.revision!)) : setConfirmEnable(rule.revision!)}>{rule.enabled ? 'Выключить правило' : 'Включить правило'}</Button></>}
    {allowed && <Button variant="secondary" disabled={busy} onClick={() => void perform(async signal => { const result = await service.check(rule.id, signal); if (!signal.aborted) setCheck(result); })}>Проверить условия (без команд)</Button>}<Button variant="quiet" onClick={() => setHistory(!history)}>{history ? 'Скрыть запуски' : 'Результаты запусков'}</Button></div>
    {confirmEnable !== null && <div className="automation-confirm" role="group" aria-label="Подтверждение включения"><p>После включения новое событие сможет автоматически отправить команды устройствам. Core повторно проверит права, условия и актуальность состояния. Это не пробный запуск.</p><Button disabled={busy} onClick={() => void perform(signal => toggle(signal, true, confirmEnable!))}>Подтвердить включение</Button><Button variant="quiet" disabled={busy} onClick={() => setConfirmEnable(null)}>Не включать</Button></div>}
    {check && <div className="automation-check" role="status"><strong>Проверка без команд · версия {check.revision}</strong><p>{check.conditions_match ? 'Дополнительные условия сейчас совпадают.' : 'Дополнительные условия сейчас не совпадают.'} {check.eligible ? 'Предварительная проверка пройдена.' : 'Есть ограничения для выполнения.'}</p>{check.issues.length > 0 && <ul>{check.issues.map((issue, i) => <li key={i}>{issueLabels[issue] ?? issue}</li>)}</ul>}<p className="quiet-note">Снимок на момент проверки, не обещание будущего выполнения. Команды не отправлялись. {check.revision !== rule.revision && 'Версия правила изменилась: обновите список.'}</p></div>}
    {error && <p role="alert">{error}</p>}{history && <RunHistory service={service} rule={rule} devices={devices} />}
  </div>;
}

export function AutomationWorkspace() {
  const repository = useRepository(), service = repository.automations!, client = useQueryClient();
  const [editing, setEditing] = useState<{ value: EditableAutomation | null } | null>(null), [notice, setNotice] = useState('');
  const rights = useQuery({ queryKey: ['automation-permissions'], queryFn: ({ signal }) => service.permissions(signal), retry: false });
  const devices = useQuery({ queryKey: ['automation-devices'], queryFn: ({ signal }) => service.devices(signal), retry: false });
  const rules = useQuery({ queryKey: ['activity', 'automations'], queryFn: ({ signal }) => repository.activity!.automations(signal), retry: false, refetchInterval: 10000, refetchIntervalInBackground: false });
  const allowed = !!rights.data && ['automation.read', 'automation.manage'].every(p => rights.data.includes(p)) && !rights.isError;
  return <>{rights.isError && <p role="alert">Не удалось проверить права. <Button variant="quiet" onClick={() => void rights.refetch()}>Повторить проверку прав</Button></p>}{rights.isPending && <p role="status">Проверяем права…</p>}{rights.isSuccess && !allowed && <p className="quiet-note">Правила доступны для чтения. Для изменений нужны права управления автоматизациями.</p>}
    <div className="resource-toolbar">{allowed && <Button disabled={!!editing || !devices.data} onClick={() => { setNotice(''); setEditing({ value: null }); }}>Создать правило</Button>}<Button variant="secondary" disabled={rules.isFetching || devices.isFetching} onClick={() => { void rules.refetch(); void devices.refetch(); }}>Обновить список</Button></div>
    {devices.isError && <p role="alert">Устройства недоступны: {coreErrorMessage(devices.error)} Редактор не использует вымышленные устройства.</p>}{notice && <p role="status">{notice}</p>}
    {editing && <AutomationEditor key={editing.value?.id ?? 'new'} service={service} initial={editing.value} devices={devices.data ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setNotice('Правило сохранено и прочитано из Core. Команды при сохранении не отправлялись.'); void client.invalidateQueries({ queryKey: ['activity', 'automations'] }); }} />}
    {rules.isPending ? <StatePanel kind="loading" title="Загружаем автоматизации" /> : rules.isError ? <StatePanel kind="error" title="Правила недоступны" description={coreErrorMessage(rules.error)} onRetry={() => void rules.refetch()} /> : !rules.data.length ? <StatePanel kind="empty" title="Пока нет правил" description="Создайте правило: событие устройства → условия → действия. Новые правила сначала сохраняются выключенными." /> : <div className="automation-grid">{rules.data.map(rule => <article className="settings-panel automation-card" key={rule.id}><div className="resource-heading"><h2>{rule.name}</h2><span className="resource-badge">{rule.enabled ? 'Включена' : 'Выключена'}</span></div><dl><dt>Когда</dt><dd>{describeRule(rule.trigger, devices.data ?? [])}</dd><dt>При условиях</dt><dd>{rule.conditions.length ? <ul>{rule.conditions.map((c, i) => <li key={i}>{describeRule(c, devices.data ?? [])}</li>)}</ul> : 'Без дополнительных условий'}</dd><dt>Выполнить</dt><dd><ol>{rule.actions.map((a, i) => <li key={i}>{describeRule(a, devices.data ?? [])}</li>)}</ol></dd></dl><RenameDefinition kind="automations" id={rule.id} name={rule.name} revision={rule.revision} /><RuleTools rule={rule} service={service} devices={devices.data ?? []} allowed={allowed} busyEditor={!!editing} onEdit={value => { setNotice(''); setEditing(previous => previous ?? { value }); }} /></article>)}</div>}
  </>;
}
