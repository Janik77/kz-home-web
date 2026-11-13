import { useState } from 'react';
import { PageHeading } from '../../components/ui/page-heading';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { RoomGrid } from './room-grid';
import { AvailabilityNotice } from '../home/availability-notice';
import { useRepository } from '../../app/services';

export function RoomsPage() {
  const readOnly = useRepository().readOnly;
  const [floor, setFloor] = useState('all');
  return <HomeDataBoundary>{(home) => <div className="page rooms-page">
    <PageHeading eyebrow={home.house.name} title="Комнаты" description={`Комнат: ${home.rooms.length} · этажей: ${home.floors.length}. Откройте комнату для просмотра устройств.`} />
    <div className="filter-bar" role="group" aria-label="Фильтр по этажу">
      {[{ id: 'all', name: 'Все комнаты' }, ...home.floors].map((item) => <button type="button" key={item.id} aria-pressed={floor === item.id} onClick={() => setFloor(item.id)}>{item.name}</button>)}
    </div>
    <RoomGrid home={home} rooms={home.rooms.filter((room) => floor === 'all' || room.floorId === floor)} headingLevel={2} />
    <AvailabilityNotice devices={home.devices} rooms={home.rooms} readOnly={readOnly === true} />
    <p className="quiet-note">Активными считаются включённые светильники и реле, а также открытые шторы.</p>
  </div>}</HomeDataBoundary>;
}
