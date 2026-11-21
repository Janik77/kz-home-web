import type { CoreSession } from './session';
import { decodeDevice, list, object, string, type CoreDevice } from './dtos';
import { validName } from './definitions';
import { CoreError } from './errors';

export type SoftwareCandidate = { id: string; type: 'relay' | 'temperature_sensor' };
export type SoftwareClaim = SoftwareCandidate & { roomId: string; name: string };
export interface SoftwareOnboarding {
  candidates(signal: AbortSignal): Promise<SoftwareCandidate[]>;
  claim(draft: SoftwareClaim, signal: AbortSignal): Promise<CoreDevice>;
  check(draft: SoftwareClaim, signal: AbortSignal): Promise<CoreDevice | null>;
}
const validId = (id: string) => /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(id);

export function createSoftwareOnboarding(session: CoreSession, houseId: string): SoftwareOnboarding {
  const base = '/v1/houses/' + encodeURIComponent(houseId) + '/software-device-candidates';
  const candidates = (signal: AbortSignal) => session.read(base, value => {
    const rows = list(value, item => {
      const v = object(item), id = string(v.device_id), type = string(v.device_type);
      if (!validId(id) || (type !== 'relay' && type !== 'temperature_sensor')) throw new CoreError('protocol');
      return { id, type } satisfies SoftwareCandidate;
    });
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new CoreError('protocol');
    return rows;
  }, signal);
  function verify(row: CoreDevice, draft: SoftwareClaim) {
    if (row.id !== draft.id || row.type !== draft.type || row.room_id !== draft.roomId || row.name !== draft.name.trim()) {
      throw new CoreError('conflict');
    }
    return row;
  }
  return {
    candidates,
    async claim(draft, signal) {
      if (!validId(draft.id) || !validId(draft.roomId) || !validName(draft.name)) throw new CoreError('validation');
      const row = await session.definitionWrite(base + '/' + encodeURIComponent(draft.id) + '/claim', 'POST',
        { room_id: draft.roomId, name: draft.name.trim() }, 201, decodeDevice, signal);
      return verify(row, draft);
    },
    async check(draft, signal) {
      const rows = await session.read('/devices?house_id=' + encodeURIComponent(houseId), value => list(value, decodeDevice), signal);
      const row = rows.find(item => item.id === draft.id);
      if (row) return verify(row, draft);
      if (!(await candidates(signal)).some(item => item.id === draft.id && item.type === draft.type)) throw new CoreError('conflict');
      return null;
    },
  };
}
