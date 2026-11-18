import { decodeDurableWait, type DurableWait } from './durable';
import { CoreError } from './errors';

// Read schemas verified against Core app/schemas/{auth,entities}.py.
// Unknown additive fields are ignored. All fields consumed by Web are checked.
export interface CoreHouse { id: string; name: string }
export interface CoreFloor extends CoreHouse { house_id: string; order: number }
export interface CoreRoom extends CoreHouse { floor_id: string }
export interface CoreDevice extends CoreHouse {
  room_id: string; type: string; state: Record<string, unknown>; online: boolean;
  capabilities: string[]; updated_at: string; numeric_observed_at?: Record<string, string | null>;
}
export interface CoreScene extends CoreHouse {
  is_draft?: boolean;
  revision?: number | undefined;
  house_id: string; actions: ({ type: 'device_state'; device_id: string; state: Record<string, unknown>; unsupported?: boolean } | DurableWait | {type:'delay';seconds:number} | {type:'unsupported';originalType:string})[];
}
export interface TokenPair { access_token: string; refresh_token: string; token_type: 'bearer'; expires_in: number }

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CoreError('protocol');
  return value as Record<string, unknown>;
}
export function string(value: unknown): string {
  if (typeof value !== 'string' || !value.length) throw new CoreError('protocol');
  return value;
}
export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new CoreError('protocol');
  return value;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new CoreError('protocol');
  return value;
}
export function list<T>(value: unknown, decode: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new CoreError('protocol');
  return value.map(decode);
}
export function decodeHouse(value: unknown): CoreHouse {
  const item = object(value); return { id: string(item.id), name: string(item.name) };
}
export function decodeFloor(value: unknown): CoreFloor {
  const item = object(value); return { ...decodeHouse(item), house_id: string(item.house_id), order: number(item.order) };
}
export function decodeRoom(value: unknown): CoreRoom {
  const item = object(value); return { ...decodeHouse(item), floor_id: string(item.floor_id) };
}
export function decodeDevice(value: unknown): CoreDevice {
  const item = object(value);
  return { ...decodeHouse(item), room_id: string(item.room_id), type: string(item.type),
    ...(item.numeric_observed_at === undefined ? {} : { numeric_observed_at: Object.fromEntries(Object.entries(object(item.numeric_observed_at)).map(([k, v]) => { if (v !== null && (typeof v !== 'string' || !Number.isFinite(Date.parse(v)))) throw new CoreError('protocol'); return [k, v as string | null]; })) }),
    state: object(item.state), online: boolean(item.online), capabilities: list(item.capabilities, string), updated_at: string(item.updated_at) };
}
export function decodeRevision(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new CoreError('protocol');
  return value;
}
export function decodeScene(value: unknown): CoreScene {
  const item = object(value);
  return { ...decodeHouse(item), ...(item.is_draft === undefined ? {} : { is_draft: boolean(item.is_draft) }), revision: decodeRevision(item.revision), house_id: string(item.house_id), actions: list(item.actions, (value) => {
    const action = object(value);
    try {
      if(action.type === 'durable_wait') return decodeDurableWait(action);
      if(action.type === 'delay') return {type:'delay' as const,seconds:number(action.seconds)};
      if (action.type === 'device_state') return { type: 'device_state' as const, device_id: string(action.device_id), state: object(action.state), ...(Object.keys(action).some(key=>!['type','device_id','state'].includes(key)) ? {unsupported:true} : {}) };
    } catch { /* One unsupported definition must not make the whole home unreadable. */ }
    return {type:'unsupported' as const,originalType:typeof action.type === 'string' ? action.type : 'неизвестный тип'};
  }) };
}
export function decodeTokens(value: unknown): TokenPair {
  const item = object(value); const seconds = number(item.expires_in);
  if (item.token_type !== 'bearer' || seconds <= 0 || !Number.isInteger(seconds)) throw new CoreError('protocol');
  return { access_token: string(item.access_token), refresh_token: string(item.refresh_token), token_type: 'bearer', expires_in: seconds };
}
export function decodeUser(value: unknown) {
  const item = object(value);
  if (!boolean(item.is_active)) throw new CoreError('unauthorized');
  return { id: string(item.id), email: string(item.email) };
}
