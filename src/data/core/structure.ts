import type { CoreSession } from './session';
import { decodeFloor, decodeRoom } from './dtos';
import { readHousePermissions } from './permissions';
import { CoreError } from './errors';
import { validName } from './definitions';
export type StructureDraft = { kind: 'floor' | 'room'; id: string; name: string; floorId: string };
export interface Structure {
 permissions(signal: AbortSignal): Promise<string[]>;
 create(draft: StructureDraft, signal: AbortSignal): Promise<void>;
}
export function createStructure(session: CoreSession, houseId: string): Structure {
 const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, houseId, signal)).permissions;
 return { permissions, async create(draft, signal) {
  if (!validName(draft.name) || !draft.id || draft.id.length > 64) throw new CoreError('validation');
  const grants = await permissions(signal);
  if (!grants.includes('house.manage') || !grants.includes('house.read')) throw new CoreError('forbidden');
  const name = draft.name.trim();
  if (draft.kind === 'floor') {
   const body = {id:draft.id, name, house_id:houseId, order:0};
   await session.definitionWrite('/floors', 'POST', body, 201, decodeFloor, signal);
   const saved = await session.read(`/floors/${encodeURIComponent(draft.id)}`, decodeFloor, signal);
   if (saved.id !== draft.id || saved.name !== name || saved.house_id !== houseId) throw new CoreError('conflict');
  } else {
   const floor = await session.read(`/floors/${encodeURIComponent(draft.floorId)}`, decodeFloor, signal);
   if (floor.house_id !== houseId) throw new CoreError('forbidden');
   await session.definitionWrite('/rooms', 'POST', {id:draft.id, name, floor_id:draft.floorId}, 201, decodeRoom, signal);
   const saved = await session.read(`/rooms/${encodeURIComponent(draft.id)}`, decodeRoom, signal);
   if (saved.id !== draft.id || saved.name !== name || saved.floor_id !== draft.floorId) throw new CoreError('conflict');
   const parent = await session.read(`/floors/${encodeURIComponent(draft.floorId)}`, decodeFloor, signal);
   if (parent.house_id !== houseId) throw new CoreError('conflict');
  }
 }};
}
