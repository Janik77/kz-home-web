import { object, string, decodeRevision } from './dtos';
import { CoreError } from './errors';
import { validName } from './definitions';
import { readHousePermissions } from './permissions';
import type { CoreSession } from './session';

export type MetadataKind = 'house' | 'floor' | 'room' | 'device';
export interface MetadataValue { kind: MetadataKind; id: string; name: string; parentId: string | null; revision: number | null }
export interface MetadataDraft { name: string; parentId: string | null }
export interface Metadata {
  permissions(signal: AbortSignal): Promise<string[]>;
  read(kind: MetadataKind, id: string, signal: AbortSignal): Promise<MetadataValue>;
  save(base: MetadataValue, draft: MetadataDraft, signal: AbortSignal): Promise<MetadataValue>;
}
const plurals = { house: 'houses', floor: 'floors', room: 'rooms', device: 'devices' };
const parents = { house: null, floor: 'house_id', room: 'floor_id', device: 'room_id' } as const;
export function decodeMetadata(kind: MetadataKind, value: unknown): MetadataValue {
  const v = object(value), field = parents[kind];
  // Missing counters on an older Core are deliberately read-only, never revision 1.
  const revision = v.metadata_revision === undefined ? null : decodeRevision(v.metadata_revision);
  if (v.metadata_revision !== undefined && !revision) throw new CoreError('protocol');
  return { kind, id: string(v.id), name: string(v.name), parentId: field ? string(v[field]) : null, revision: revision ?? null };
}
export function createMetadata(session: CoreSession, house: string): Metadata {
  const path = (kind: MetadataKind, id: string) => `/${plurals[kind]}/${encodeURIComponent(id)}`;
  const raw = async (kind: MetadataKind, id: string, signal: AbortSignal) => {
    const result = await session.read(path(kind, id), value => decodeMetadata(kind, value), signal);
    signal.throwIfAborted();
    if (result.id !== id) throw new CoreError('protocol');
    return result;
  };
  async function scope(value: MetadataValue, signal: AbortSignal): Promise<void> {
    if (value.kind === 'house') { if (value.id !== house) throw new CoreError('forbidden'); return; }
    if (value.kind === 'floor') { if (value.parentId !== house) throw new CoreError('forbidden'); return; }
    if (!value.parentId) throw new CoreError('protocol');
    await scope(await raw(value.kind === 'room' ? 'floor' : 'room', value.parentId, signal), signal);
  }
  const read = async (kind: MetadataKind, id: string, signal: AbortSignal) => { const value = await raw(kind, id, signal); await scope(value, signal); return value; };
  const permissions = async (signal: AbortSignal) => (await readHousePermissions(session, house, signal)).permissions;
  return { read, permissions, async save(base, draft, signal) {
    if (!base.revision) throw new CoreError('read-only');
    if (!validName(draft.name) || (base.kind !== 'house' && !draft.parentId)) throw new CoreError('validation');
    const grants = await permissions(signal);
    if (!grants.includes('house.read') || !grants.includes(base.kind === 'device' ? 'device.manage' : 'house.manage')) throw new CoreError('forbidden');
    const current = await read(base.kind, base.id, signal);
    if (current.revision !== base.revision || current.name !== base.name || current.parentId !== base.parentId) throw new CoreError('conflict');
    if ((base.kind === 'house' || base.kind === 'floor') && draft.parentId !== base.parentId) throw new CoreError('validation');
    const name = draft.name.trim();
    await scope({ ...base, parentId: draft.parentId }, signal);
    const body: Record<string, unknown> = { name, expected_metadata_revision: base.revision };
    if (base.kind === 'room') body.floor_id = draft.parentId;
    if (base.kind === 'device') body.room_id = draft.parentId;
    signal.throwIfAborted();
    const written = await session.definitionWrite(path(base.kind, base.id), 'PATCH', body, 200, value => decodeMetadata(base.kind, value), signal);
    if (written.id !== base.id || written.revision !== base.revision + 1 || written.name !== name || written.parentId !== draft.parentId) throw new CoreError('protocol');
    const saved = await read(base.kind, base.id, signal);
    if (saved.revision !== written.revision || saved.name !== written.name || saved.parentId !== written.parentId) throw new CoreError('conflict');
    return saved;
  } };
}
