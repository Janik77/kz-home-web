import { CoreError } from './errors';

// Read schemas verified against Core app/schemas/{auth,entities}.py.
// Unknown additive fields are ignored. All fields consumed by Web are checked.
export interface CoreHouse { id: string; name: string }
export interface CoreFloor extends CoreHouse { house_id: string; order: number }
export interface CoreRoom extends CoreHouse { floor_id: string }
export interface CoreDevice extends CoreHouse {
  room_id: string; type: string; state: Record<string, unknown>; online: boolean;
  capabilities: string[]; updated_at: string;
}
export interface CoreScene extends CoreHouse {
  house_id: string; actions: { type: 'device_state'; device_id: string; state: Record<string, unknown> }[];
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
    state: object(item.state), online: boolean(item.online), capabilities: list(item.capabilities, string), updated_at: string(item.updated_at) };
}
export function decodeScene(value: unknown): CoreScene {
  const item = object(value);
  return { ...decodeHouse(item), house_id: string(item.house_id), actions: list(item.actions, (value) => {
    const action = object(value);
    if (action.type !== 'device_state') throw new CoreError('protocol');
    return { type: 'device_state', device_id: string(action.device_id), state: object(action.state) };
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
