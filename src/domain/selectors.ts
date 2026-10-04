import type { Device, DeviceCommand, HomeSnapshot, Scene } from './home';

export function isActive(device: Device): boolean {
  if (device.connection === 'offline') return false;
  if (device.kind === 'light' || device.kind === 'relay') return device.on;
  return device.kind === 'curtain' && device.position > 0;
}

export function getHomeSummary(home: HomeSnapshot) {
  const online = home.devices.filter((device) => device.connection === 'online');
  const sensors = online.filter((device) => device.kind === 'sensor');
  return {
    online: online.length,
    total: home.devices.length,
    offline: home.devices.length - online.length,
    lightsOn: online.filter((device) => device.kind === 'light' && device.on).length,
    temperature: sensors.length
      ? sensors.reduce((sum, sensor) => sum + sensor.temperature, 0) / sensors.length
      : null,
  };
}

export function describeDevice(device: Device): string {
  if (device.connection === 'offline') return 'Offline · last known state';
  switch (device.kind) {
    case 'light': return device.on ? `On · ${device.brightness}% brightness` : 'Off';
    case 'relay': return device.on ? 'Power on' : 'Power off';
    case 'curtain': return device.position === 0 ? 'Closed' : device.position === 100 ? 'Open' : `${device.position}% open`;
    case 'sensor': return `${device.temperature.toFixed(1)}°C · ${device.humidity}% humidity`;
  }
}

export function getRoomSummary(devices: Device[]) {
  const online = devices.filter((device) => device.connection === 'online');
  const sensors = online.filter((device) => device.kind === 'sensor');
  return {
    total: devices.length, online: online.length, offline: devices.length - online.length,
    active: devices.filter(isActive).length,
    temperature: sensors.length ? sensors.reduce((sum, sensor) => sum + sensor.temperature, 0) / sensors.length : null,
    humidity: sensors.length ? sensors.reduce((sum, sensor) => sum + sensor.humidity, 0) / sensors.length : null,
  };
}

export function getSceneSummary(scene: Scene, home: HomeSnapshot) {
  const ids = new Set(scene.actions.map((action) => action.deviceId));
  const devices = home.devices.filter((device) => ids.has(device.id));
  const roomIds = new Set(devices.map((device) => device.roomId));
  return {
    deviceCount: ids.size,
    rooms: home.rooms.filter((room) => roomIds.has(room.id)),
    unavailableControls: scene.actions.filter((action) => !devices.some((device) => device.id === action.deviceId && device.connection === 'online')).length,
  };
}

export function describeCommand(command: DeviceCommand): string {
  switch (command.type) {
    case 'set-power': return command.on ? 'On' : 'Off';
    case 'set-brightness': return `${command.brightness}% brightness`;
    case 'set-position': return `${command.position}% open`;
  }
}
