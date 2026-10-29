import { describe, expect, it } from 'vitest';
import { decodeDevice, decodeScene, decodeTokens, decodeUser } from './dtos';
import { mapDevice, mapHome } from './mapping';
import { getHomeSummary, getRoomSummary, getSceneSummary } from '../../domain/selectors';
import { coreHouse, coreFloor, coreRoom, coreDevice, coreScene, coreUser } from '../../test/core-fixtures';

describe('Core DTO boundary', () => {
  it('scopes graph by house, orders floors and adds no customer decoration', () => {
    const home = mapHome(coreHouse, [{ ...coreFloor, id: 'up', order: 1 }, coreFloor, { ...coreFloor, id: 'foreign', house_id: 'b' }],
      [coreRoom, { ...coreRoom, id: 'foreign-room', floor_id: 'foreign' }], [decodeDevice(coreDevice)],
      [decodeScene(coreScene), { ...decodeScene(coreScene), id: 'foreign-scene', house_id: 'b' }]);
    expect(home.floors.map((floor) => floor.id)).toEqual(['floor-a', 'up']);
    expect(home.rooms).toHaveLength(1); expect(home.scenes).toHaveLength(1);
    expect(home.house.location).toBe(''); expect(home.rooms[0]?.image).toBe(''); expect(home.devices[0]?.favorite).toBe(false);
    expect(home.scenes[0]?.description).toBe('');
    expect(home.scenes[0]?.readActions?.[0]?.description).toBe('Power: On · Brightness: 25%');
    expect(getSceneSummary(home.scenes[0]!, home)).toMatchObject({ deviceCount: 1, unavailableControls: 0 });
    expect(getHomeSummary(home).lightsOn).toBe(1);
  });
  it('preserves unknown/partial states and capabilities without false on/off defaults', () => {
    expect(mapDevice(decodeDevice({ ...coreDevice, type: 'relay', capabilities: ['on_off'], state: {} }))).toMatchObject({ kind: 'other', readings: [] });
    expect(mapDevice(decodeDevice({ ...coreDevice, capabilities: ['on_off'], state: { on: true } }))).toMatchObject({ kind: 'light', on: true, brightness: null });
    expect(mapDevice(decodeDevice({ ...coreDevice, type: 'curtain', capabilities: ['position'], state: { position: 35 } }))).toMatchObject({ kind: 'curtain', position: 35 });
    expect(mapDevice(decodeDevice({ ...coreDevice, type: 'new_type', state: { unknown_field: 4 } }))).toMatchObject({ kind: 'other', typeLabel: 'new type', readings: [{ label: 'unknown field', value: '4' }] });
  });
  it('maps single-measurement climate without fabricating humidity or measurement time', () => {
    const device = mapDevice(decodeDevice({ ...coreDevice, type: 'temperature_sensor', capabilities: ['temperature'], state: { temperature: 22.4 } }));
    expect(device).toMatchObject({ kind: 'other', temperature: 22.4 });
    expect(device).not.toHaveProperty('humidity'); expect(device).not.toHaveProperty('measuredAt');
    expect(getRoomSummary([device])).toMatchObject({ temperature: 22.4, humidity: null });
    expect(getRoomSummary([{ ...device, connection: 'offline' }]).temperature).toBeNull();
  });
  it('fails visibly on an inconsistent scoped graph instead of dropping devices', () => {
    expect(() => mapHome(coreHouse, [], [], [decodeDevice(coreDevice)], [])).toThrow();
  });
  it('runtime-validates all consumed response fields', () => {
    expect(() => decodeDevice({ ...coreDevice, online: 'true' })).toThrow();
    expect(() => decodeDevice({ ...coreDevice, state: null })).toThrow();
    expect(() => decodeScene({ ...coreScene, actions: [{ type: 'delay' }] })).toThrow();
    expect(() => decodeTokens({ token_type: 'cookie', expires_in: 900 })).toThrow();
    expect(() => decodeUser({ ...coreUser, is_active: false })).toThrow();
  });
  it('keeps last-known ON state separate from reported connectivity and active counts', () => {
    const device = mapDevice(decodeDevice({ ...coreDevice, online: false, state: { on: true, brightness: 45 } }));
    expect(device).toMatchObject({ kind: 'light', connection: 'offline', on: true, brightness: 45 });
    expect(getRoomSummary([device])).toMatchObject({ online: 0, offline: 1, active: 0 });
  });
});
