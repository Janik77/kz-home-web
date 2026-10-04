// Contract-shaped test responses only. These are not live Core evidence.
export const timestamp = '2026-10-04T10:00:00Z';
export const coreHouse = { id: 'house-a', name: 'Family home', created_at: timestamp, updated_at: timestamp };
export const coreFloor = { id: 'floor-a', name: 'Ground floor', house_id: 'house-a', order: 0, created_at: timestamp, updated_at: timestamp };
export const coreRoom = { id: 'room-a', name: 'Living room', floor_id: 'floor-a', icon: null, created_at: timestamp, updated_at: timestamp };
export const coreDevice = { id: 'lamp-a', name: 'Reading light', room_id: 'room-a', type: 'light', state: { on: true, brightness: 45 }, online: true, capabilities: ['on_off', 'brightness'], metadata: {}, created_at: timestamp, updated_at: timestamp };
export const coreScene = { id: 'scene-a', name: 'Evening', house_id: 'house-a', actions: [{ type: 'device_state', device_id: 'lamp-a', state: { on: true, brightness: 25 } }], created_at: timestamp, updated_at: timestamp };
export const coreUser = { id: 'user-a', email: 'homeowner@example.test', is_active: true, is_superuser: false, created_at: timestamp, updated_at: timestamp };
export const tokenPair = { access_token: 'test-access-1', refresh_token: 'test-refresh-1', token_type: 'bearer', expires_in: 900 };
export const coreResponses: Record<string, unknown> = {
  '/auth/login': tokenPair, '/auth/me': coreUser, '/houses': [coreHouse],
  '/houses/house-a': coreHouse, '/floors': [coreFloor], '/rooms': [coreRoom],
  '/devices?house_id=house-a': [coreDevice], '/scenes': [coreScene],
};
