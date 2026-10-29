import type { Device } from '../../domain/home';

// Sample presentation only: never rename Core data.
const samples: Record<string, string> = {
  'Family home': 'Демонстрационный дом', 'Living room': 'Гостиная', Kitchen: 'Кухня', Bedroom: 'Спальня', 'Home office': 'Кабинет',
  'Ceiling lights': 'Потолочный свет', 'Window curtains': 'Шторы', 'Coffee corner': 'Кофейный уголок', 'Bedside lamp': 'Прикроватный свет',
  'Desk lamp': 'Настольная лампа', 'Good morning': 'Утро', 'Cozy evening': 'Уютный вечер', 'Good night': 'Спокойной ночи', 'Leaving home': 'Ушёл из дома',
};
export const displayName = (name: string, readOnly: boolean) => readOnly ? name : samples[name] ?? name;
export function countRu(count: number, words: [string, string, string]) {
  const rule = new Intl.PluralRules('ru').select(count);
  return `${count} ${words[rule === 'one' ? 0 : rule === 'few' ? 1 : 2]}`;
}
export function stateRu(device: Device): string {
  switch (device.kind) {
    case 'light': return device.on ? `Включён${device.brightness === null ? ' · яркость неизвестна' : ` · ${device.brightness}%`}` : 'Выключен';
    case 'relay': return device.on ? 'Включено' : 'Выключено';
    case 'curtain': return device.position === 0 ? 'Закрыты' : `Открыты на ${device.position}%`;
    case 'sensor': return `${device.temperature.toFixed(1)} °C · ${device.humidity}%`;
    case 'other': return device.readings.map((reading) => `${reading.label}: ${reading.value}`).join(' · ') || 'Нет данных о состоянии';
  }
}
