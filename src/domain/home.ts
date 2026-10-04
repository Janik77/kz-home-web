// Frontend domain models. These are not wire formats or a proposed Core API contract.
export interface House {
  id: string;
  name: string;
  location: string;
}

export interface Floor {
  id: string;
  houseId: string;
  name: string;
}

export interface Room {
  id: string;
  floorId: string;
  name: string;
  description: string;
  image: string;
  imagePosition: string;
}

interface DeviceBase {
  id: string;
  roomId: string;
  name: string;
  connection: 'online' | 'offline';
  favorite: boolean;
}

export type Device = DeviceBase & (
  | { kind: 'light'; on: boolean; brightness: number }
  | { kind: 'relay'; on: boolean }
  | { kind: 'curtain'; position: number }
  | { kind: 'sensor'; temperature: number; humidity: number; measuredAt: string }
);

export type DeviceCommand =
  | { type: 'set-power'; deviceId: string; on: boolean }
  | { type: 'set-brightness'; deviceId: string; brightness: number }
  | { type: 'set-position'; deviceId: string; position: number };

export interface Scene {
  id: string;
  name: string;
  description: string;
  icon: 'sunrise' | 'sofa' | 'moon' | 'away';
  actions: DeviceCommand[];
}

export interface HomeSnapshot {
  house: House;
  floors: Floor[];
  rooms: Room[];
  devices: Device[];
  scenes: Scene[];
}

export interface SceneResult {
  home: HomeSnapshot;
  applied: number;
  skipped: number;
}
