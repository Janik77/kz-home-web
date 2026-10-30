import type { HomeRepository } from '../home-repository';
import type { AccessibleHouse } from '../../domain/session';
import { decodeDevice, decodeFloor, decodeHouse, decodeRoom, decodeScene, list } from './dtos';
import { CoreError } from './errors';
import { mapHome } from './mapping';
import type { CoreSession } from './session';
import { createRelayControl } from './relay-control';

export function readHouses(session: CoreSession, signal?: AbortSignal): Promise<AccessibleHouse[]> {
  return session.read('/houses', (value) => list(value, decodeHouse), signal);
}

export function createCoreHomeRepository(session: CoreSession, houseId: string): HomeRepository {
  // Legacy/mock snapshot mutations remain disabled. v0.15 uses separate receipts.
  return {
    readOnly: true,
    relayControl: createRelayControl(session, houseId),
    async getHome(signal) {
      const [house, floors, rooms, devices, scenes] = await Promise.all([
        session.read(`/houses/${encodeURIComponent(houseId)}`, decodeHouse, signal),
        session.read('/floors', (value) => list(value, decodeFloor), signal),
        session.read('/rooms', (value) => list(value, decodeRoom), signal),
        session.read(`/devices?house_id=${encodeURIComponent(houseId)}`, (value) => list(value, decodeDevice), signal),
        session.read('/scenes', (value) => list(value, decodeScene), signal),
      ]);
      return mapHome(house, floors, rooms, devices, scenes);
    },
    sendCommand() { return Promise.reject(new CoreError('read-only')); },
    activateScene() { return Promise.reject(new CoreError('read-only')); },
  };
}
