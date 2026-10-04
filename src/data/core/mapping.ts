import type { Device, HomeSnapshot, Scene } from '../../domain/home';
import type { CoreDevice, CoreFloor, CoreHouse, CoreRoom, CoreScene } from './dtos';
import { CoreError } from './errors';

function numeric(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value); }
function percent(value: unknown): value is number { return numeric(value) && Number.isInteger(value) && value >= 0 && value <= 100; }
const labels: Record<string, string> = { on: 'Power', brightness: 'Brightness', position: 'Open amount', temperature: 'Temperature', humidity: 'Humidity', motion: 'Motion', leak: 'Leak', target_temperature: 'Target temperature', illuminance: 'Illuminance' };

function describeValue(key: string, value: unknown): string {
  if (typeof value === 'boolean') return key === 'on' ? (value ? 'On' : 'Off') : value ? 'Detected' : 'Not detected';
  if (numeric(value)) return `${value}${['position', 'brightness', 'humidity'].includes(key) ? '%' : ['temperature', 'target_temperature'].includes(key) ? '°C' : ''}`;
  if (typeof value === 'string') return value;
  return 'Unavailable';
}

export function mapDevice(dto: CoreDevice): Device {
  const base = { id: dto.id, name: dto.name, roomId: dto.room_id,
    connection: dto.online ? 'online' as const : 'offline' as const, favorite: false };
  const state = dto.state;
  const supports = (field: string) => dto.capabilities.includes(field);
  if (dto.type === 'light' && supports('on_off') && typeof state.on === 'boolean') {
    return { ...base, kind: 'light', on: state.on, brightness: supports('brightness') && percent(state.brightness) ? state.brightness : null };
  }
  if (['relay', 'socket', 'switch'].includes(dto.type) && supports('on_off') && typeof state.on === 'boolean') {
    return { ...base, kind: 'relay', on: state.on };
  }
  if (dto.type === 'curtain' && supports('position') && percent(state.position)) return { ...base, kind: 'curtain', position: state.position };
  // Partial state, single-measurement sensors and future types are visible without defaults.
  // Core updated_at is intentionally not mapped to a measurement timestamp.
  const typeLabel = dto.type.replaceAll('_', ' ');
  const readings = Object.entries(state).map(([key, value]) => ({ label: labels[key] ?? key.replaceAll('_', ' '), value: describeValue(key, value) }));
  return { ...base, kind: 'other', typeLabel, readings,
    ...(supports('temperature') && numeric(state.temperature) ? { temperature: state.temperature } : {}),
    ...(supports('humidity') && numeric(state.humidity) ? { humidity: state.humidity } : {}) };
}

function mapScene(dto: CoreScene): Scene {
  return { id: dto.id, name: dto.name, description: '', icon: 'scene', actions: [],
    readActions: dto.actions.map((action) => ({ deviceId: action.device_id,
      description: Object.entries(action.state).map(([key, value]) => `${labels[key] ?? key.replaceAll('_', ' ')}: ${describeValue(key, value)}`).join(' · ') || 'No state changes' })) };
}

export function mapHome(house: CoreHouse, allFloors: CoreFloor[], allRooms: CoreRoom[], devices: CoreDevice[], allScenes: CoreScene[]): HomeSnapshot {
  const floors = allFloors.filter((floor) => floor.house_id === house.id).sort((a, b) => a.order - b.order);
  const floorIds = new Set(floors.map((floor) => floor.id));
  const rooms = allRooms.filter((room) => floorIds.has(room.floor_id));
  const roomIds = new Set(rooms.map((room) => room.id));
  // Device reads have already been scoped by Core. Never silently drop a device
  // with inconsistent location data (physical ownership may differ from location).
  if (devices.some((device) => !roomIds.has(device.room_id))) throw new CoreError('protocol');
  return {
    house: { id: house.id, name: house.name, location: '' },
    floors: floors.map((floor) => ({ id: floor.id, houseId: floor.house_id, name: floor.name })),
    rooms: rooms.map((room) => ({ id: room.id, floorId: room.floor_id, name: room.name, description: '', image: '', imagePosition: 'center' })),
    devices: devices.map(mapDevice), scenes: allScenes.filter((scene) => scene.house_id === house.id).map(mapScene),
  };
}
