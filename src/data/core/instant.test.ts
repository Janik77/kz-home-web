import { expect, it } from 'vitest';
import { sameCoreInstant } from './instant';

it('compares offset instants across dates without rounding their fractional seconds', () => {
  expect(sameCoreInstant('2026-11-13T20:00:00.123456Z', '2026-11-14T01:00:00.123456+05:00')).toBe(true);
  expect(sameCoreInstant('2026-11-13T20:00:00.123456Z', '2026-11-14T01:00:00.123455+05:00')).toBe(false);
  expect(sameCoreInstant('2026-11-13T20:00:00.000Z', '2026-11-13T20:00:00+00:00')).toBe(true);
  expect(sameCoreInstant('2026-02-30T20:00:00Z', '2026-03-02T20:00:00Z')).toBe(false);
  expect(sameCoreInstant('2026-11-13T20:00:00', '2026-11-13T20:00:00Z')).toBe(false);
  expect(sameCoreInstant(null, undefined)).toBe(false);
});
