import type { Device, DeviceCommand, HomeSnapshot } from '../../domain/home';
import type { HomeRepository } from '../home-repository';
import { initialHome } from './fixtures';

function percentage(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error('Choose a value between 0 and 100.');
  }
  return Math.round(value);
}

function updateDevice(device: Device, command: DeviceCommand): Device {
  if (device.connection === 'offline') throw new Error(`${device.name} is offline. Try again when it reconnects.`);
  if (command.type === 'set-power' && (device.kind === 'light' || device.kind === 'relay')) {
    return device.kind === 'light'
      ? { ...device, on: command.on, brightness: command.on && device.brightness === 0 ? 100 : device.brightness }
      : { ...device, on: command.on };
  }
  if (command.type === 'set-brightness' && device.kind === 'light') {
    const brightness = percentage(command.brightness);
    return { ...device, brightness, on: brightness > 0 };
  }
  if (command.type === 'set-position' && device.kind === 'curtain') {
    return { ...device, position: percentage(command.position) };
  }
  throw new Error('This control is not available for this device.');
}

function wait(delay: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Request cancelled', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Request cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, delay);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export function createMockHomeRepository(seed: HomeSnapshot = initialHome, delay = 320): HomeRepository {
  let state = structuredClone(seed);
  return {
    async getHome(signal) { await wait(delay, signal); return structuredClone(state); },
    async sendCommand(command) {
      await wait(delay);
      if (!state.devices.some((device) => device.id === command.deviceId)) throw new Error('Device could not be found.');
      state = { ...state, devices: state.devices.map((device) => device.id === command.deviceId ? updateDevice(device, command) : device) };
      return structuredClone(state);
    },
    async activateScene(sceneId) {
      await wait(delay);
      const scene = state.scenes.find((item) => item.id === sceneId);
      if (!scene) throw new Error('Scene could not be found.');
      let applied = 0;
      let skipped = 0;
      let devices = state.devices;
      for (const action of scene.actions) {
        const device = devices.find((item) => item.id === action.deviceId);
        if (!device || device.connection === 'offline') { skipped++; continue; }
        const updated = updateDevice(device, action);
        devices = devices.map((item) => item.id === updated.id ? updated : item);
        applied++;
      }
      state = { ...state, devices };
      return { home: structuredClone(state), applied, skipped };
    },
  };
}
