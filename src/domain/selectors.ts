import type { Device, DeviceCommand, HomeSnapshot, Scene } from './home';

export function isActive(device: Device): boolean {
  if (device.connection === 'offline') return false;
  if (device.kind === 'light' || device.kind === 'relay') return device.on;
  return device.kind === 'curtain' && device.position > 0;
}

export function getHomeSummary(home: HomeSnapshot) {
  const online = home.devices.filter((device) => device.connection === 'online');
  const sensors = temperatures(online);
  return {
    online: online.length,
    total: home.devices.length,
    offline: home.devices.length - online.length,
    lightsOn: online.filter((device) => device.kind === 'light' && device.on).length,
    temperature: sensors.length
      ? sensors.reduce((sum, value) => sum + value, 0) / sensors.length
      : null,
  };
}

export function describeDevice(device: Device): string {
  if (device.connection === 'offline') return 'Не в сети · последнее состояние';
  switch (device.kind) {
    case 'light': return device.on ? device.brightness === null ? 'Включено · яркость неизвестна' : `Включено · яркость ${device.brightness}%` : 'Выключено';
    case 'relay': return device.on ? 'Питание включено' : 'Питание выключено';
    case 'curtain': return device.position === 0 ? 'Закрыто' : device.position === 100 ? 'Открыто' : `Открыто на ${device.position}%`;
    case 'sensor': return `${device.temperature.toFixed(1)}°C · влажность ${device.humidity}%`;
    case 'other': return device.readings.length ? device.readings.map((reading) => `${reading.label}: ${reading.value}`).join(' · ') : 'Состояние ещё не получено';
  }
}

export function getRoomSummary(devices: Device[]) {
  const online = devices.filter((device) => device.connection === 'online');
  const temperature = temperatures(online);
  const humidity = online.flatMap((device) => (device.kind === 'sensor' || device.kind === 'other') && device.humidity !== undefined ? [device.humidity] : []);
  return {
    total: devices.length, online: online.length, offline: devices.length - online.length,
    active: devices.filter(isActive).length,
    temperature: temperature.length ? temperature.reduce((sum, value) => sum + value, 0) / temperature.length : null,
    humidity: humidity.length ? humidity.reduce((sum, value) => sum + value, 0) / humidity.length : null,
  };
}

export function getSceneSummary(scene: Scene, home: HomeSnapshot) {
  const actions = scene.readActions ?? scene.actions;
  const ids = new Set(actions.map((action) => action.deviceId));
  const devices = home.devices.filter((device) => ids.has(device.id));
  const roomIds = new Set(devices.map((device) => device.roomId));
  return {
    deviceCount: ids.size,
    rooms: home.rooms.filter((room) => roomIds.has(room.id)),
    unavailableControls: actions.filter((action) => !devices.some((device) => device.id === action.deviceId && device.connection === 'online')).length,
  };
}

function temperatures(devices: Device[]): number[] {
  return devices.flatMap((device) => (device.kind === 'sensor' || device.kind === 'other') && device.temperature !== undefined ? [device.temperature] : []);
}

export function describeCommand(command: DeviceCommand): string {
  switch (command.type) {
    case 'set-power': return command.on ? 'Включено' : 'Выключено';
    case 'set-brightness': return `Яркость ${command.brightness}%`;
    case 'set-position': return `Открыто на ${command.position}%`;
  }
}
