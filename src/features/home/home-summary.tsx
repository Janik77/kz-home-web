import { Lightbulb, Thermometer, Wifi } from 'lucide-react';
import type { HomeSnapshot } from '../../domain/home';
import { getHomeSummary } from '../../domain/selectors';

export function HomeSummary({ home, readOnly = false }: { home: HomeSnapshot; readOnly?: boolean }) {
  const summary = getHomeSummary(home);
  return <dl className="home-summary" aria-label="Состояние дома">
    <div><dt><Wifi size={19} aria-hidden="true" />Устройства в сети</dt><dd>{summary.online}<span className="summary-unit"> / {summary.total}</span><span>{summary.offline ? `${summary.offline} ${readOnly ? 'не в сети по данным Core' : 'не в сети'}` : summary.total ? readOnly ? 'Все в сети по данным Core' : 'Демо-подключение' : 'Устройств пока нет'}</span></dd></div>
    <div><dt><Lightbulb size={19} aria-hidden="true" />Освещение</dt><dd>{summary.lightsOn} <span className="summary-unit">светильников включено</span><span>{readOnly ? 'Данные устройств' : 'Демо-состояние'}</span></dd></div>
    <div><dt><Thermometer size={19} aria-hidden="true" />Температура</dt><dd>{summary.temperature === null ? '—' : `${summary.temperature.toFixed(1)}°C`}<span>{summary.temperature === null ? 'Нет датчиков в сети' : readOnly ? 'Среднее Core · свежесть неизвестна' : 'Демо-среднее'}</span></dd></div>
  </dl>;
}
