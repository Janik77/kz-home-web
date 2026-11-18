import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderHome } from '../../test/render-home';
import { initialHome } from '../../data/mock/fixtures';
import { createMockHomeRepository } from '../../data/mock/mock-home-repository';
import { CoreError } from '../../data/core/errors';
import type { Automations, EditableAutomation } from '../../data/core/automations';
import { AutomationWorkspace } from './automation-workspace';

const device = { id: 'relay-a', name: 'Программное реле', room_id: 'room-a', type: 'relay', capabilities: ['on_off'], state: { on: false }, online: true, updated_at: '2026-11-17T12:00:00Z' };
const rule: EditableAutomation = { id: 'rule-a', houseId: 'house-a', name: 'Вечер', enabled: false, revision: 1, trigger: 'relay-a · on = true', conditions: [], actions: ['relay-a · {"on":false}'], draft: { id: 'rule-a', name: 'Вечер', trigger: { type: 'device_state', device_id: 'relay-a', field: 'on', operator: 'eq', value: true }, conditions: [], actions: [{ type: 'device_state', device_id: 'relay-a', state: { on: false } }] } };
function setup(overrides: Partial<Automations> = {}, withRule = false, readRules?: () => Promise<EditableAutomation[]>) {
  const save = vi.fn<Automations['save']>(async () => rule), toggle = vi.fn<Automations['toggle']>(async () => ({ ...rule, enabled: true, revision: 2 })), check = vi.fn<Automations['check']>(async () => ({ automation_id: rule.id, revision: 1, eligible: false, conditions_match: true, issues: ['rule_disabled'], actions: [] }));
  const service: Automations = { permissions: async () => ['automation.read', 'automation.manage'], devices: async () => [device], read: async () => rule, save, toggle, check, runs: async () => [], ...overrides };
  const rename = vi.fn(async () => undefined);
  const repo = { ...createMockHomeRepository(initialHome, 0), definitions: { permissions: service.permissions, rename, createScene: vi.fn() }, automations: service, activity: { automations: readRules ?? (async () => withRule ? [rule] : []), events: async () => [] } };
  renderHome(repo, () => <AutomationWorkspace />); return { save, toggle, check, rename };
}
it('creates a complete validated disabled-by-adapter draft without execution', async () => {
  const t = setup(); await userEvent.click(await screen.findByRole('button', { name: 'Создать правило' }));
  expect(screen.getByRole('button', { name: 'Сохранить правило' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Название правила'), 'Уютный вечер');
  await userEvent.selectOptions(screen.getByLabelText('Событие: устройство'), device.id);
  await userEvent.selectOptions(screen.getByLabelText('Действие 1: устройство'), device.id);
  await userEvent.selectOptions(screen.getByLabelText('Действие 1: питание'), 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить правило' }));
  expect(t.save).toHaveBeenCalledTimes(1); expect(t.save.mock.calls[0]?.[0]).toMatchObject({ name: 'Уютный вечер', actions: [{ device_id: device.id, state: { on: false } }] });
  expect(t.save.mock.calls[0]?.[1]).toBeUndefined(); expect(t.toggle).not.toHaveBeenCalled(); expect(t.check).not.toHaveBeenCalled();
  expect(await screen.findByText(/Правило сохранено и прочитано/)).toBeInTheDocument();
});
it('dry-run does not enable; enabling has an explicit impactful confirmation', async () => {
  const t = setup({}, true); await userEvent.click(await screen.findByRole('button', { name: 'Проверить условия (без команд)' }));
  expect(await screen.findByText('Правило выключено')).toBeInTheDocument(); expect(t.toggle).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Включить правило' })); expect(t.toggle).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Подтвердить включение' }));
  expect(t.toggle).toHaveBeenCalledWith(rule.id, true, 1, expect.any(AbortSignal));
});
it('preserves conflicted edits and only reads comparison without automatic retry', async () => {
  const save = vi.fn<Automations['save']>(async () => { throw new CoreError('conflict'); }); setup({ save }, true);
  await userEvent.click(await screen.findByRole('button', { name: 'Редактировать правило' }));
  const input = await screen.findByLabelText('Название правила'); await userEvent.clear(input); await userEvent.type(input, 'Мой черновик');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить правило' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Запись изменилась'); expect(input).toHaveValue('Мой черновик');
  await userEvent.click(screen.getByRole('button', { name: 'Сравнить с версией Core' }));
  expect(await screen.findByRole('heading', { name: 'Сейчас в Core: версия 1' })).toBeInTheDocument(); expect(save).toHaveBeenCalledTimes(1); expect(input).toHaveValue('Мой черновик');
});
it('read-only users cannot create or toggle but can read server history', async () => {
  setup({ permissions: async () => ['automation.read'] }, true);
  expect(await screen.findByText(/Правила доступны для чтения/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Создать правило' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Включить правило' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Результаты запусков' }));
  const history = await screen.findByRole('region', { name: 'Запуски: Вечер' }); expect(within(history).getByText(/Запусков пока нет/)).toBeInTheDocument();
});
it('does not turn unsupported rule into a lossy editable draft', async () => {
  setup({ read: async () => ({ ...rule, draft: null }) }, true);
  await userEvent.click(await screen.findByRole('button', { name: 'Редактировать правило' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('сохранено без изменений'); expect(screen.queryByLabelText('Название правила')).not.toBeInTheDocument();
});

it('retains legacy name-only CAS rename without rewriting unsupported actions or enabling', async () => {
  const t = setup({ read: async () => ({ ...rule, draft: null }) }, true);
  await userEvent.click(await screen.findByRole('button', { name: 'Изменить название' }));
  await userEvent.clear(screen.getByLabelText('Новое название'));
  await userEvent.type(screen.getByLabelText('Новое название'), 'Без изменения логики');
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить название' }));
  expect(t.rename).toHaveBeenCalledWith('automations', 'rule-a', 'Вечер', 'Без изменения логики', expect.any(AbortSignal), 1);
  expect(t.save).not.toHaveBeenCalled(); expect(t.toggle).not.toHaveBeenCalled();
});
it('edits supported numeric threshold with hysteresis and numeric AND without enabling', async () => {
  const sensor = { ...device, id: 'sensor-a', name: 'Температура дома', type: 'temperature_sensor', capabilities: ['temperature', 'humidity'], state: { temperature: 23, humidity: 50 } };
  const t = setup({ devices: async () => [device, sensor] });
  await userEvent.click(await screen.findByRole('button', { name: 'Создать правило' }));
  await userEvent.type(screen.getByLabelText('Название правила'), 'Жарко');
  await userEvent.selectOptions(screen.getByLabelText('Событие: устройство'), sensor.id);
  expect(screen.getByText(/Первое свежее показание/)).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('Гистерезис · °C'));
  expect(screen.getByRole('button', { name: 'Сохранить правило' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Гистерезис · °C'), '2');
  await userEvent.click(screen.getByRole('button', { name: 'Добавить условие' }));
  await userEvent.selectOptions(screen.getByLabelText('Условие 1: устройство'), sensor.id);
  await userEvent.selectOptions(screen.getByLabelText('Условие 1: показатель'), 'humidity');
  await userEvent.selectOptions(screen.getByLabelText('Действие 1: устройство'), device.id);
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить правило' }));
  expect(t.save.mock.calls[0]?.[0]).toMatchObject({ trigger: { type: 'numeric_threshold', field: 'temperature', operator: 'gt', value: 25, hysteresis: 2 }, conditions: [{ type: 'numeric_state', field: 'humidity', operator: 'gt' }] });
  expect(t.toggle).not.toHaveBeenCalled();
});

it('allows numeric trigger on mixed relay capabilities without removing power choice', async () => {
  setup({ devices: async () => [{ ...device, capabilities: ['on_off', 'temperature'], state: { on: false, temperature: 23 } }] });
  await userEvent.click(await screen.findByRole('button', { name: 'Создать правило' }));
  await userEvent.selectOptions(screen.getByLabelText('Событие: устройство'), device.id);
  expect(screen.getByLabelText('Событие: питание')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Событие: показатель'), 'temperature');
  expect(screen.getByLabelText('Гистерезис · °C')).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('Событие: показатель'), 'on');
  expect(screen.getByLabelText('Событие: питание')).toBeInTheDocument();
});

it('uses verified saved revision immediately and blocks toggle while editor is open', async () => {
  const saved = { ...rule, revision: 2 };
  let reads = 0;
  const t = setup({ save: async () => saved }, true, async () => { if (++reads === 1) return [rule]; return new Promise(() => {}); });
  await userEvent.click(await screen.findByRole('button', { name: 'Редактировать правило' }));
  expect(screen.getByRole('button', { name: 'Включить правило' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить правило' }));
  await screen.findByText(/Правило сохранено и прочитано/);
  await userEvent.click(screen.getByRole('button', { name: 'Включить правило' }));
  await userEvent.click(screen.getByRole('button', { name: 'Подтвердить включение' }));
  expect(t.toggle).toHaveBeenCalledWith(rule.id, true, 2, expect.any(AbortSignal));
});
