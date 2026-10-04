import { useState } from 'react';
import { PageHeading } from '../../components/ui/page-heading';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { RoomGrid } from './room-grid';

export function RoomsPage() {
  const [floor, setFloor] = useState('all');
  return <HomeDataBoundary>{(home) => <div className="page">
    <PageHeading eyebrow="EVERY SPACE, TOGETHER" title="Your rooms." description="A little overview. A lot of comfort." />
    <div className="filter-bar" role="group" aria-label="Filter rooms by floor">
      {[{ id: 'all', name: 'All rooms' }, ...home.floors].map((item) => <button type="button" key={item.id} aria-pressed={floor === item.id} onClick={() => setFloor(item.id)}>{item.name}</button>)}
    </div>
    <RoomGrid home={home} rooms={home.rooms.filter((room) => floor === 'all' || room.floorId === floor)} />
    <p className="quiet-note">{home.house.name} · {home.rooms.length} rooms across {home.floors.length} floors</p>
  </div>}</HomeDataBoundary>;
}
