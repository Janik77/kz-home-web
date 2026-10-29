import type { HomeRepository } from '../home-repository';
import type { AccessibleHouse } from '../../domain/session';
import { decodeDevice, decodeFloor, decodeHouse, decodeRoom, decodeScene, list } from './dtos';
import { CoreError } from './errors';
import { mapHome } from './mapping';
import type { CoreSession } from './session';

export function readHouses(session: CoreSession, signal?: AbortSignal): Promise<AccessibleHouse[]> {
  return session.read('/houses', (value) => list(value, decodeHouse), signal);
}

export function createCoreHomeRepository(session: CoreSession, houseId: string): HomeRepository {
  // v0.6 discovery: HTTP returns DeviceRead, discarding MQTT command/correlation
  // IDs. Neither a successful request nor state equality can confirm this intent.
  // Fail closed until Core exposes an authorized, correlatable outcome contract.
  // Never reuse the mock snapshot-returning mutation path for real commands.
  return {
    readOnly: true,
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
