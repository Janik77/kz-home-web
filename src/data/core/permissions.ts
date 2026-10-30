import { list, object, string } from './dtos';
import { CoreError } from './errors';
import type { CoreSession } from './session';

export interface HousePermissions { house_id: string; permissions: string[] }
export async function readHousePermissions(session: CoreSession, houseId: string, signal: AbortSignal): Promise<HousePermissions> {
  const result = await session.read(`/v1/houses/${encodeURIComponent(houseId)}/me/permissions`, value => {
    const item = object(value);
    const house = string(item.house_id);
    const permissions = list(item.permissions, string);
    if (house !== houseId || new Set(permissions).size !== permissions.length) throw new CoreError('protocol');
    return { house_id: house, permissions };
  }, signal);
  signal.throwIfAborted();
  return result;
}
