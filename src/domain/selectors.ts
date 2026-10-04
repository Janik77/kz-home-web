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
  if (device.connection === 'offline') return 'Offline · last known state';
  switch (device.kind) {
    case 'light': return device.on ? device.brightness === null ? 'On · brightness unavailable' : `On · ${device.brightness}% brightness` : 'Off';
    case 'relay': return device.on ? 'Power on' : 'Power off';
    case 'curtain': return device.position === 0 ? 'Closed' : device.position === 100 ? 'Open' : `${device.position}% open`;
    case 'sensor': return `${device.temperature.toFixed(1)}°C · ${device.humidity}% humidity`;
    case 'other': return device.readings.length ? device.readings.map((reading) => `${reading.label}: ${reading.value}`).join(' · ') : 'No reported state yet';
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
    case 'set-power': return command.on ? 'On' : 'Off';
    case 'set-brightness': return `${command.brightness}% brightness`;
    case 'set-position': return `${command.position}% open`;
  }
}
