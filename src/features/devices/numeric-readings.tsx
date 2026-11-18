import { useEffect, useState } from 'react';
import type { Device } from '../../domain/home';
export function NumericReadings({ device }: { device: Device }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (!device.numericReadings?.length) return null;
  return <dl className="numeric-readings" aria-label="Показания датчика">{device.numericReadings.map(reading => {
    const age = reading.observedAt ? now - Date.parse(reading.observedAt) : NaN;
    const fresh = device.connection === 'online' && reading.value !== null && age >= -5000 && age <= 120000;
    return <div key={reading.field}><dt>{reading.label}</dt><dd><strong>{reading.value === null ? 'Неизвестно' : `${reading.value.toLocaleString('ru-RU')} ${reading.unit}`}</strong><span>{fresh ? 'Свежее показание' : reading.value === null ? 'Нет корректного показания' : device.connection === 'offline' ? 'Последнее известное · нет связи' : !Number.isFinite(age) ? 'Свежесть неизвестна' : 'Устарело · не используется для правил'}</span>{reading.observedAt && <time dateTime={reading.observedAt}>{new Date(reading.observedAt).toLocaleString('ru-RU')}</time>}</dd></div>;
  })}</dl>;
}
