import type { HomeSnapshot } from '../../domain/home';

export const initialHome: HomeSnapshot = {
  house: { id: 'family-home', name: 'Family home', location: 'Almaty, Kazakhstan' },
  floors: [
    { id: 'ground', houseId: 'family-home', name: 'Ground floor' },
    { id: 'first', houseId: 'family-home', name: 'First floor' },
  ],
  rooms: [
    { id: 'living', floorId: 'ground', name: 'Living room', description: 'A space to slow down.', image: '/images/living-room.jpg', imagePosition: '50% 58%' },
    { id: 'kitchen', floorId: 'ground', name: 'Kitchen', description: 'The heart of everyday life.', image: '/images/kitchen.jpg', imagePosition: '50% 60%' },
    { id: 'bedroom', floorId: 'first', name: 'Bedroom', description: 'Settle into a restful evening.', image: '/images/bedroom.jpg', imagePosition: '50% 60%' },
    { id: 'office', floorId: 'first', name: 'Home office', description: 'Room for a little focus.', image: '/images/office.jpg', imagePosition: '50% 55%' },
  ],
  devices: [
    { id: 'living-main', roomId: 'living', name: 'Ceiling lights', kind: 'light', connection: 'online', on: true, brightness: 72, favorite: true },
    { id: 'living-curtains', roomId: 'living', name: 'Window curtains', kind: 'curtain', connection: 'online', position: 65, favorite: true },
    { id: 'living-climate', roomId: 'living', name: 'Room climate', kind: 'sensor', connection: 'online', temperature: 23.4, humidity: 42, measuredAt: '2026-10-04T12:00:00Z', favorite: false },
    { id: 'kitchen-pendant', roomId: 'kitchen', name: 'Pendant lights', kind: 'light', connection: 'online', on: false, brightness: 80, favorite: false },
    { id: 'kitchen-plug', roomId: 'kitchen', name: 'Coffee corner', kind: 'relay', connection: 'online', on: false, favorite: true },
    { id: 'bedroom-lamp', roomId: 'bedroom', name: 'Bedside lamp', kind: 'light', connection: 'online', on: true, brightness: 35, favorite: true },
    { id: 'bedroom-curtains', roomId: 'bedroom', name: 'Blackout curtains', kind: 'curtain', connection: 'online', position: 0, favorite: false },
    { id: 'bedroom-climate', roomId: 'bedroom', name: 'Room climate', kind: 'sensor', connection: 'online', temperature: 22.6, humidity: 45, measuredAt: '2026-10-04T12:00:00Z', favorite: false },
    { id: 'office-lamp', roomId: 'office', name: 'Desk lamp', kind: 'light', connection: 'offline', on: false, brightness: 60, favorite: false },
    { id: 'office-plug', roomId: 'office', name: 'Desk power', kind: 'relay', connection: 'online', on: true, favorite: false },
  ],
  scenes: [
    { id: 'morning', name: 'Good morning', description: 'Open up. Ease into the day.', icon: 'sunrise', actions: [
      { type: 'set-position', deviceId: 'living-curtains', position: 100 },
      { type: 'set-position', deviceId: 'bedroom-curtains', position: 100 },
      { type: 'set-power', deviceId: 'kitchen-pendant', on: true },
      { type: 'set-brightness', deviceId: 'living-main', brightness: 80 },
    ] },
    { id: 'evening', name: 'Cozy evening', description: 'Softer light. A slower pace.', icon: 'sofa', actions: [
      { type: 'set-brightness', deviceId: 'living-main', brightness: 35 },
      { type: 'set-position', deviceId: 'living-curtains', position: 0 },
      { type: 'set-brightness', deviceId: 'bedroom-lamp', brightness: 25 },
    ] },
    { id: 'night', name: 'Good night', description: 'Lights out. Rest easy.', icon: 'moon', actions: [
      { type: 'set-power', deviceId: 'living-main', on: false },
      { type: 'set-power', deviceId: 'kitchen-pendant', on: false },
      { type: 'set-power', deviceId: 'bedroom-lamp', on: false },
      { type: 'set-position', deviceId: 'bedroom-curtains', position: 0 },
    ] },
    { id: 'away', name: 'Leaving home', description: 'Switch off the everyday.', icon: 'away', actions: [
      { type: 'set-power', deviceId: 'living-main', on: false },
      { type: 'set-power', deviceId: 'kitchen-pendant', on: false },
      { type: 'set-power', deviceId: 'bedroom-lamp', on: false },
      { type: 'set-power', deviceId: 'office-lamp', on: false },
      { type: 'set-power', deviceId: 'kitchen-plug', on: false },
      { type: 'set-power', deviceId: 'office-plug', on: false },
    ] },
  ],
};
