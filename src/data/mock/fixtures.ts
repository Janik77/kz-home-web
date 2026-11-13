import type { HomeSnapshot } from '../../domain/home';

export const initialHome: HomeSnapshot = {
  house: { id: 'family-home', name: 'Демонстрационный дом', location: 'Алматы · пример дома' },
  floors: [
    { id: 'ground', houseId: 'family-home', name: 'Первый этаж' },
    { id: 'first', houseId: 'family-home', name: 'Второй этаж' },
  ],
  rooms: [
    { id: 'living', floorId: 'ground', name: 'Гостиная', description: 'Место для отдыха и тёплых встреч.', image: '/images/living-room.jpg', imagePosition: '50% 58%' },
    { id: 'kitchen', floorId: 'ground', name: 'Кухня', description: 'Свет для готовки и семейных завтраков.', image: '/images/kitchen.jpg', imagePosition: '50% 60%' },
    { id: 'bedroom', floorId: 'first', name: 'Спальня', description: 'Всё для спокойного вечера.', image: '/images/bedroom.jpg', imagePosition: '50% 60%' },
    { id: 'office', floorId: 'first', name: 'Кабинет', description: 'Комфортное место для работы.', image: '/images/office.jpg', imagePosition: '50% 55%' },
  ],
  devices: [
    { id: 'living-main', roomId: 'living', name: 'Потолочный свет', kind: 'light', connection: 'online', on: true, brightness: 72, favorite: true },
    { id: 'living-curtains', roomId: 'living', name: 'Шторы', kind: 'curtain', connection: 'online', position: 65, favorite: true },
    { id: 'living-climate', roomId: 'living', name: 'Климат комнаты', kind: 'sensor', connection: 'online', temperature: 23.4, humidity: 42, measuredAt: '2026-10-04T12:00:00Z', favorite: false },
    { id: 'kitchen-pendant', roomId: 'kitchen', name: 'Свет над столом', kind: 'light', connection: 'online', on: false, brightness: 80, favorite: false },
    { id: 'kitchen-plug', roomId: 'kitchen', name: 'Кофейный уголок', kind: 'relay', connection: 'online', on: false, favorite: true },
    { id: 'bedroom-lamp', roomId: 'bedroom', name: 'Прикроватный свет', kind: 'light', connection: 'online', on: true, brightness: 35, favorite: true },
    { id: 'bedroom-curtains', roomId: 'bedroom', name: 'Плотные шторы', kind: 'curtain', connection: 'online', position: 0, favorite: false },
    { id: 'bedroom-climate', roomId: 'bedroom', name: 'Климат комнаты', kind: 'sensor', connection: 'online', temperature: 22.6, humidity: 45, measuredAt: '2026-10-04T12:00:00Z', favorite: false },
    { id: 'office-lamp', roomId: 'office', name: 'Настольная лампа', kind: 'light', connection: 'offline', on: false, brightness: 60, favorite: false },
    { id: 'office-plug', roomId: 'office', name: 'Питание стола', kind: 'relay', connection: 'online', on: true, favorite: false },
  ],
  scenes: [
    { id: 'morning', name: 'Утро', description: 'Открыть шторы и включить утренний свет.', icon: 'sunrise', actions: [
      { type: 'set-position', deviceId: 'living-curtains', position: 100 },
      { type: 'set-position', deviceId: 'bedroom-curtains', position: 100 },
      { type: 'set-power', deviceId: 'kitchen-pendant', on: true },
      { type: 'set-brightness', deviceId: 'living-main', brightness: 80 },
    ] },
    { id: 'evening', name: 'Уютный вечер', description: 'Приглушить свет и закрыть шторы в гостиной.', icon: 'sofa', actions: [
      { type: 'set-brightness', deviceId: 'living-main', brightness: 35 },
      { type: 'set-position', deviceId: 'living-curtains', position: 0 },
      { type: 'set-brightness', deviceId: 'bedroom-lamp', brightness: 25 },
    ] },
    { id: 'night', name: 'Спокойной ночи', description: 'Выключить свет и закрыть шторы в спальне.', icon: 'moon', actions: [
      { type: 'set-power', deviceId: 'living-main', on: false },
      { type: 'set-power', deviceId: 'kitchen-pendant', on: false },
      { type: 'set-power', deviceId: 'bedroom-lamp', on: false },
      { type: 'set-position', deviceId: 'bedroom-curtains', position: 0 },
    ] },
    { id: 'away', name: 'Ушёл из дома', description: 'Выключить свет и выбранные розетки.', icon: 'away', actions: [
      { type: 'set-power', deviceId: 'living-main', on: false },
      { type: 'set-power', deviceId: 'kitchen-pendant', on: false },
      { type: 'set-power', deviceId: 'bedroom-lamp', on: false },
      { type: 'set-power', deviceId: 'office-lamp', on: false },
      { type: 'set-power', deviceId: 'kitchen-plug', on: false },
      { type: 'set-power', deviceId: 'office-plug', on: false },
    ] },
  ],
};
