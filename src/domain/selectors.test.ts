import { describe, expect, it } from 'vitest';
import { initialHome } from '../data/mock/fixtures';
import { describeDevice, getHomeSummary, getRoomSummary, getSceneSummary, isActive } from './selectors';

describe('home summaries', () => {
  it('counts only online devices and averages only available sensor readings', () => {
    expect(getHomeSummary(initialHome)).toEqual({ online: 9, total: 10, offline: 1, lightsOn: 2, temperature: 23 });
    const home = structuredClone(initialHome);
    home.devices = home.devices.map((device) => device.kind === 'sensor' ? { ...device, connection: 'offline' } : device);
    expect(getHomeSummary(home).temperature).toBeNull();
  });

  it('never treats a last-known offline state as active', () => {
    const offline = { id: 'test', roomId: 'test', name: 'Light', connection: 'offline', kind: 'light', favorite: false, on: true, brightness: 50 } as const;
    expect(isActive(offline)).toBe(false);
    expect(describeDevice(offline)).toBe('Offline · last known state');
  });

  it('keeps room availability and climate truthful with offline sensors', () => {
    const devices = initialHome.devices.filter((device) => device.roomId === 'living');
    expect(getRoomSummary(devices)).toMatchObject({ online: 3, offline: 0, active: 2, temperature: 23.4, humidity: 42 });
    expect(getRoomSummary(devices.map((device) => ({ ...device, connection: 'offline' })))).toMatchObject({ online: 0, active: 0, temperature: null, humidity: null });
    expect(getRoomSummary([])).toMatchObject({ total: 0, temperature: null });
  });

  it('deduplicates affected devices and rooms while counting unavailable commands', () => {
    const scene = initialHome.scenes.find((item) => item.id === 'away')!;
    const repeated = { ...scene, actions: [...scene.actions, { type: 'set-power', deviceId: 'office-lamp', on: false } as const, { type: 'set-power', deviceId: 'missing', on: false } as const] };
    const summary = getSceneSummary(repeated, initialHome);
    expect(summary.deviceCount).toBe(7);
    expect(summary.rooms).toHaveLength(4);
    expect(summary.unavailableControls).toBe(3);
  });
});
