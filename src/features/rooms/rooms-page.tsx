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
    <PageHeading eyebrow={home.house.name} title="Rooms" description={`${home.rooms.length} rooms across ${home.floors.length} floors. Open a room to ${readOnly ? 'view' : 'manage'} its devices.`} />
    <AvailabilityNotice devices={home.devices} rooms={home.rooms} readOnly={readOnly === true} />
    <div className="filter-bar" role="group" aria-label="Filter rooms by floor">
      {[{ id: 'all', name: 'All rooms' }, ...home.floors].map((item) => <button type="button" key={item.id} aria-pressed={floor === item.id} onClick={() => setFloor(item.id)}>{item.name}</button>)}
    </div>
    <RoomGrid home={home} rooms={home.rooms.filter((room) => floor === 'all' || room.floorId === floor)} headingLevel={2} />
    <p className="quiet-note">Active devices include lights and power that are on, and curtains that are open.</p>
  </div>}</HomeDataBoundary>;
}
