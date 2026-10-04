import { describe, expect, it } from 'vitest';
import { initialHome } from '../data/mock/fixtures';
import { describeDevice, getHomeSummary, isActive } from './selectors';

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
});
