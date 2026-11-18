import { expect, it } from 'vitest';
import { decodeDevice } from './dtos';
import { mapDevice } from './mapping';
import { decodeEditableAutomation, automationErrors, type AutomationDraft } from './automations';
import { thresholdExplanation, validNumericTest, type NumericTrigger } from './numeric';
const trigger: NumericTrigger = { type: 'numeric_threshold', device_id: 'sensor', field: 'temperature', operator: 'gt', value: 25, hysteresis: 2 };
const sensor = { id: 'sensor', name: 'Климат', room_id: 'room', type: 'temperature_sensor', capabilities: ['temperature'], online: true, state: { temperature: 23 }, updated_at: '2026-11-18T12:00:00Z' };
const relay = { ...sensor, id: 'relay', type: 'relay', capabilities: ['on_off'], state: { on: false } };
const draft: AutomationDraft = { id: 'rule', name: 'Жарко', trigger, conditions: [{ type: 'numeric_state', device_id: 'sensor', field: 'temperature', operator: 'gte', value: 24 }], actions: [{ type: 'device_state', device_id: 'relay', state: { on: true } }] };
it('round-trips threshold and numeric AND definitions without lossy conversion', () => {
  const decoded = decodeEditableAutomation({ ...draft, house_id: 'house', enabled: false, revision: 1 });
  expect(decoded.draft).toEqual(draft); expect(decoded.trigger).toContain('Первое свежее');
  expect(automationErrors(draft, [sensor, relay])).toEqual([]);
});
it('preserves unsupported legacy numeric definitions as read-only', () => {
  expect(decodeEditableAutomation({ ...draft, trigger: { ...trigger, type: 'device_state' }, house_id: 'house', enabled: false }).draft).toBeNull();
  expect(decodeEditableAutomation({ ...draft, trigger: { ...trigger, secret_future_option: true }, house_id: 'house', enabled: false }).draft).toBeNull();
});
it.each([0, -1, NaN, Infinity, 200])('rejects unsafe hysteresis %s', hysteresis => expect(validNumericTest({ ...trigger, hysteresis })).toBe(false));
it.each([NaN, Infinity, 151, -101])('rejects invalid threshold %s', value => expect(validNumericTest({ ...trigger, value })).toBe(false));
it('requires an explicitly declared capability, not a conveniently named state property', () => {
  expect(automationErrors(draft, [{ ...sensor, capabilities: [] }, relay])).not.toEqual([]);
  expect(mapDevice({ ...sensor, capabilities: [] })).toMatchObject({ numericReadings: [], readings: [] });
});
it('does not infer observation time from updated_at or invent a missing measurement', () => {
  expect(mapDevice(sensor)).toMatchObject({ numericReadings: [{ value: 23, unit: '°C', observedAt: null }] });
  expect(mapDevice({ ...sensor, state: {} })).toMatchObject({ numericReadings: [{ value: null }] });
  expect(mapDevice({ ...sensor, state: { temperature: Infinity } })).toMatchObject({ numericReadings: [{ value: null }] });
});
it('decodes field-specific observation time and rejects invalid timestamps', () => {
  expect(decodeDevice({ ...sensor, numeric_observed_at: { temperature: null } }).numeric_observed_at).toEqual({ temperature: null });
  expect(() => decodeDevice({ ...sensor, numeric_observed_at: { temperature: 'invalid' } })).toThrow();
});
it('explains strict crossing, hysteresis recovery and first-sample baseline', () => {
  expect(thresholdExplanation(trigger)).toContain('к 23 °C или ниже');
  expect(thresholdExplanation({ ...trigger, operator: 'lt' })).toContain('к 27 °C или выше');
});

it('accepts actual Core null hysteresis defaults on nonthreshold tests without losing meaningful fields', () => {
  const wire = { ...draft, house_id: 'house', enabled: false, trigger: { type: 'device_state', device_id: 'relay', field: 'on', operator: 'eq', value: true, hysteresis: null }, conditions: draft.conditions.map(c => ({ ...c, hysteresis: null })) };
  expect(decodeEditableAutomation(wire).draft?.trigger).toEqual({ type: 'device_state', device_id: 'relay', field: 'on', operator: 'eq', value: true });
  expect(decodeEditableAutomation(wire).draft?.conditions).toEqual(draft.conditions);
  expect(decodeEditableAutomation({ ...wire, conditions: draft.conditions.map(c => ({ ...c, hysteresis: 1 })) }).draft).toBeNull();
});

it('retains nonnumeric state beside numeric readings on a mixed sensor', () => {
  const mixed = mapDevice({ ...sensor, capabilities: ['motion', 'illuminance'], state: { motion: true, illuminance: 120 } });
  expect(mixed).toMatchObject({ kind: 'other', readings: [{ label: 'Движение', value: 'Обнаружено' }], numericReadings: [{ field: 'illuminance', value: 120 }] });
});
