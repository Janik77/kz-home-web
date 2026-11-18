import type { CoreDevice } from './dtos';
export const numericFields = {
  temperature: { label: 'Температура', unit: '°C', min: -100, max: 150 },
  humidity: { label: 'Влажность', unit: '%', min: 0, max: 100 },
  illuminance: { label: 'Освещённость', unit: 'лк', min: 0, max: 200000 },
} as const;
export type NumericField = keyof typeof numericFields;
export type NumericOperator = 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte';
export interface NumericCondition { type: 'numeric_state'; device_id: string; field: NumericField; operator: NumericOperator; value: number }
export interface NumericTrigger { type: 'numeric_threshold'; device_id: string; field: NumericField; operator: 'lt' | 'gt'; value: number; hysteresis: number }
export function isNumericField(field: string): field is NumericField { return Object.hasOwn(numericFields, field); }
export function validReading(field: NumericField, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= numericFields[field].min && value <= numericFields[field].max;
}
export function numericCapabilities(device: CoreDevice): NumericField[] { return device.capabilities.filter(isNumericField); }
export function validNumericTest(test: NumericTrigger | NumericCondition): boolean {
  if (!isNumericField(test.field) || !validReading(test.field, test.value)) return false;
  if (test.type === 'numeric_state') return ['eq', 'neq', 'lt', 'lte', 'gt', 'gte'].includes(test.operator);
  if (!['lt', 'gt'].includes(test.operator) || !Number.isFinite(test.hysteresis) || test.hysteresis <= 0) return false;
  return validReading(test.field, test.value + (test.operator === 'lt' ? test.hysteresis : -test.hysteresis));
}
export function thresholdExplanation(test: NumericTrigger): string {
  const { unit } = numericFields[test.field];
  const reset = test.value + (test.operator === 'lt' ? test.hysteresis : -test.hysteresis);
  return `Сработает при переходе ${test.operator === 'lt' ? 'ниже' : 'выше'} ${test.value} ${unit}. Повторное срабатывание возможно только после возврата к ${reset} ${unit} ${test.operator === 'lt' ? 'или выше' : 'или ниже'}. Первое свежее показание задаёт исходную точку и не запускает действие.`;
}
