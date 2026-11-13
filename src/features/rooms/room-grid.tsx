import type { HomeSnapshot, Room } from '../../domain/home';
import { StatePanel } from '../../components/ui/state-panel';
import { RoomCard } from './room-card';

export function RoomGrid({ home, rooms = home.rooms, headingLevel = 3 }: { home: HomeSnapshot; rooms?: Room[]; headingLevel?: 2 | 3 }) {
  if (!rooms.length) return <StatePanel kind="empty" title="Комнат пока нет" description="Здесь появятся комнаты после добавления в Core." />;
  return <div className="room-grid">{rooms.map((room) => <RoomCard key={room.id} room={room} devices={home.devices.filter((device) => device.roomId === room.id)} floorName={home.floors.find((floor) => floor.id === room.floorId)?.name ?? 'Этаж не указан'} headingLevel={headingLevel} />)}</div>;
}
