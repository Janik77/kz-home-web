import { useState } from 'react';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { PageHeading } from '../../components/ui/page-heading';
import { DeviceGroups } from './device-groups';
import { StatePanel } from '../../components/ui/state-panel';

export function DevicesPage() {
  const [search, setSearch] = useState('');
  const [connection, setConnection] = useState('all');
  return <HomeDataBoundary locale="ru">{home => {
    const devices = home.devices.filter(device => (connection === 'all' || device.connection === connection) && `${device.name} ${home.rooms.find(room => room.id === device.roomId)?.name ?? ''}`.toLocaleLowerCase('ru-RU').includes(search.trim().toLocaleLowerCase('ru-RU')));
    return <div className="page"><PageHeading eyebrow={home.house.name} title="Устройства" description="Найдите устройство по названию или комнате. Недоступные устройства сохраняют последнее известное состояние." />
      <div className="device-filters"><label>Поиск устройств<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Название или комната" /></label><label>Подключение<select value={connection} onChange={event => setConnection(event.target.value)}><option value="all">Все устройства</option><option value="online">В сети</option><option value="offline">Не в сети</option></select></label></div>
      <p className="quiet-note" role="status">Найдено: {devices.length} из {home.devices.length}</p>
      {devices.length ? <DeviceGroups devices={devices} rooms={home.rooms} /> : <StatePanel kind="empty" title="Устройства не найдены" description="Измените поиск или фильтр подключения." />}
    </div>;
  }}</HomeDataBoundary>;
}
