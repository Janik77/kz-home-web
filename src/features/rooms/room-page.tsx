import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { PageHeading } from '../../components/ui/page-heading';
import { SectionHeading } from '../../components/ui/section-heading';
import { StatePanel } from '../../components/ui/state-panel';
import { DeviceGrid } from '../devices/device-grid';
import { HomeDataBoundary } from '../home/home-data-boundary';

export function RoomPage() {
  const { roomId } = useParams();
  return <HomeDataBoundary>{(home) => {
    const room = home.rooms.find((item) => item.id === roomId);
    if (!room) return <><Link to="/rooms" className="text-link"><ArrowLeft size={16} aria-hidden="true" />Back to rooms</Link><StatePanel kind="empty" title="Room not found" description="This room may have been removed. You can find your current rooms in the overview." /></>;
    const floor = home.floors.find((item) => item.id === room.floorId);
    const devices = home.devices.filter((device) => device.roomId === room.id);
    return <div className="page"><Link to="/rooms" className="text-link back-link"><ArrowLeft size={16} aria-hidden="true" />All rooms</Link>
      <PageHeading eyebrow={floor?.name.toUpperCase() ?? 'YOUR ROOM'} title={room.name} description={room.description} />
      <div className="room-banner"><img src={room.image} alt="" style={{ objectPosition: room.imagePosition }} width="1800" height="900" /></div>
      <section aria-labelledby="room-devices-title"><SectionHeading id="room-devices-title" title="Make yourself comfortable" description={`${devices.length} devices in this room. All controls are simulated in this preview.`} /><DeviceGrid devices={devices} rooms={home.rooms} /></section>
    </div>;
  }}</HomeDataBoundary>;
}
