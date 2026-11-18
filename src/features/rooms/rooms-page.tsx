import { useConfirmLeave } from '../../app/draft-guard-context';
import { MetadataEditor } from '../metadata/metadata-editor';
import { CreateSpace } from './create-space';
import { useState } from 'react';
import { PageHeading } from '../../components/ui/page-heading';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { RoomGrid } from './room-grid';
import { AvailabilityNotice } from '../home/availability-notice';
import { useRepository } from '../../app/services';

export function RoomsPage() {
  const readOnly = useRepository().readOnly;
  const confirmLeave = useConfirmLeave();
  const [floor, setFloor] = useState('all');
  return <HomeDataBoundary>{(home) => <div className="page everyday-page rooms-page">
    <div className="rooms-toolbar"><PageHeading eyebrow={home.house.name} title="Комнаты" description={`Комнат: ${home.rooms.length} · этажей: ${home.floors.length}. Откройте комнату для просмотра устройств.`} />
    <CreateSpace home={home} /></div>
    <div className="filter-bar" role="group" aria-label="Фильтр по этажу">
      {[{ id: 'all', name: 'Все комнаты' }, ...home.floors].map((item) => <button type="button" key={item.id} aria-pressed={floor === item.id} onClick={() => { if (floor !== item.id) confirmLeave(() => setFloor(item.id)); }}>{item.name}</button>)}
    </div>
    {readOnly && home.floors.length > 0 && <div className="floor-actions" aria-label="Управление этажами">{home.floors.filter(item => floor === 'all' || item.id === floor).map(item => <details key={item.id}><summary>{item.name} · действия</summary><MetadataEditor kind="floor" id={item.id} title={item.name} /></details>)}</div>}
    <RoomGrid home={home} rooms={home.rooms.filter((room) => floor === 'all' || room.floorId === floor)} headingLevel={2} />
    <AvailabilityNotice devices={home.devices} rooms={home.rooms} readOnly={readOnly === true} />
    {!readOnly && <p className="quiet-note">Активными считаются включённые светильники и реле, а также открытые шторы.</p>}
  </div>}</HomeDataBoundary>;
}
