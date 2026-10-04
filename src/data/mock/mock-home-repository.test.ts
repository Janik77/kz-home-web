import { describe, expect, it } from 'vitest';
import { createMockHomeRepository } from './mock-home-repository';
import { initialHome } from './fixtures';

describe('mock repository boundary', () => {
  it('isolates instances, seed objects, and returned snapshots', async () => {
    const first = createMockHomeRepository(initialHome, 0);
    const second = createMockHomeRepository(initialHome, 0);
    const snapshot = await first.getHome();
    snapshot.house.name = 'Changed outside the repository';
    expect((await first.getHome()).house.name).toBe('Family home');
    await first.sendCommand({ type: 'set-power', deviceId: 'living-main', on: false });
    expect((await second.getHome()).devices.find((device) => device.id === 'living-main')).toMatchObject({ on: true });
    expect(initialHome.devices.find((device) => device.id === 'living-main')).toMatchObject({ on: true });
  });

  it('rejects offline, missing, incompatible, and invalid commands without changing state', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    await expect(repository.sendCommand({ type: 'set-power', deviceId: 'office-lamp', on: true })).rejects.toThrow('offline');
    await expect(repository.sendCommand({ type: 'set-power', deviceId: 'missing', on: true })).rejects.toThrow('found');
    await expect(repository.sendCommand({ type: 'set-power', deviceId: 'living-climate', on: true })).rejects.toThrow('not available');
    await expect(repository.sendCommand({ type: 'set-position', deviceId: 'living-curtains', position: 101 })).rejects.toThrow('between 0 and 100');
    await expect(repository.sendCommand({ type: 'set-brightness', deviceId: 'living-main', brightness: NaN })).rejects.toThrow('between 0 and 100');
    expect(await repository.getHome()).toEqual(initialHome);
  });

  it('sets zero brightness to off and confirms the resulting snapshot', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const snapshot = await repository.sendCommand({ type: 'set-brightness', deviceId: 'living-main', brightness: 0 });
    expect(snapshot.devices.find((device) => device.id === 'living-main')).toMatchObject({ on: false, brightness: 0 });
    const switchedOn = await repository.sendCommand({ type: 'set-power', deviceId: 'living-main', on: true });
    expect(switchedOn.devices.find((device) => device.id === 'living-main')).toMatchObject({ on: true, brightness: 100 });
  });

  it('reports partial scene execution rather than claiming offline actions succeeded', async () => {
    const repository = createMockHomeRepository(initialHome, 0);
    const result = await repository.activateScene('away');
    expect(result.applied).toBe(5);
    expect(result.skipped).toBe(1);
    expect(result.home.devices.filter((device) => device.kind === 'light' || device.kind === 'relay').every((device) => !device.on)).toBe(true);
    await expect(repository.activateScene('missing')).rejects.toThrow('found');
  });

  it('does not persist a partially applied scene if an invalid action fails', async () => {
    const seed = structuredClone(initialHome);
    seed.scenes.push({ id: 'invalid', name: 'Invalid', icon: 'moon', description: 'For boundary testing', actions: [
      { type: 'set-power', deviceId: 'living-main', on: false },
      { type: 'set-position', deviceId: 'living-curtains', position: -10 },
    ] });
    const repository = createMockHomeRepository(seed, 0);
    await expect(repository.activateScene('invalid')).rejects.toThrow('between 0 and 100');
    expect(await repository.getHome()).toEqual(seed);
  });

  it('supports request cancellation', async () => {
    const repository = createMockHomeRepository(initialHome, 10);
    const controller = new AbortController();
    const request = repository.getHome(controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    await expect(repository.getHome(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
