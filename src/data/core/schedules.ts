import { CoreError } from './errors';
import { object, string, decodeRevision } from './dtos';
import type { CoreSession } from './session';
import { readHousePermissions } from './permissions';

export interface ScheduleTrigger { type: 'schedule'; time: string; weekdays: number[] }
export const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
export function decodeSchedule(value: unknown): ScheduleTrigger {
  const v = object(value);
  if (Object.keys(v).some(k => !['type', 'time', 'weekdays'].includes(k)) || v.type !== 'schedule' || typeof v.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v.time) || !Array.isArray(v.weekdays) || !v.weekdays.length || v.weekdays.length > 7 || v.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6) || new Set(v.weekdays).size !== v.weekdays.length) throw new CoreError('protocol');
  return { type: 'schedule', time: v.time, weekdays: [...v.weekdays].sort((a, b) => a - b) };
}
export function validSchedule(value: unknown) { try { decodeSchedule(value); return true; } catch { return false; } }
export function scheduleDescription(value: unknown) { const raw = object(value); const v = decodeSchedule({ type: raw.type, time: raw.time, weekdays: raw.weekdays }); return `По расписанию: ${v.weekdays.map(d => weekdays[d]).join(', ')} в ${v.time} · часовой пояс дома`; }
export interface HouseTimezone { id: string; timezone: string | null; revision: number }
export function validTimezone(value: string) { try { if (!value || value !== value.trim()) return false; new Intl.DateTimeFormat('ru', { timeZone: value }); return true; } catch { return false; } }
export function decodeHouseTimezone(value: unknown): HouseTimezone {
  const v = object(value), revision = decodeRevision(v.timezone_revision);
  if (!revision || (v.timezone !== null && (typeof v.timezone !== 'string' || !validTimezone(v.timezone)))) throw new CoreError('protocol');
  return { id: string(v.id), timezone: v.timezone as string | null, revision };
}
export interface HouseClock { read(signal: AbortSignal): Promise<HouseTimezone>; permissions(signal: AbortSignal): Promise<string[]>; save(timezone: string | null, expectedRevision: number, signal: AbortSignal): Promise<HouseTimezone> }
export function createHouseClock(session: CoreSession, house: string): HouseClock {
  const path = `/houses/${encodeURIComponent(house)}`;
  const decode = (value: unknown) => { const v = decodeHouseTimezone(value); if (v.id !== house) throw new CoreError('protocol'); return v; };
  const read = (signal: AbortSignal) => session.read(path, decode, signal);
  const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, house, signal)).permissions;
  return { read, permissions, async save(timezone, expectedRevision, signal) {
    if (!decodeRevision(expectedRevision) || (timezone !== null && !validTimezone(timezone))) throw new CoreError('validation');
    if (!(await permissions(signal)).includes('house.manage')) throw new CoreError('forbidden');
    const written = await session.definitionWrite(path, 'PATCH', { timezone, expected_timezone_revision: expectedRevision }, 200, decode, signal);
    if (written.revision !== expectedRevision + 1 || written.timezone !== timezone) throw new CoreError('protocol');
    const saved = await read(signal);
    if (saved.revision !== written.revision || saved.timezone !== written.timezone) throw new CoreError('conflict');
    return saved;
  } };
}
