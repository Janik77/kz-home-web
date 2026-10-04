import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { PageHeading } from '../../components/ui/page-heading';
import { StatePanel } from '../../components/ui/state-panel';
import { DeviceGroups } from '../devices/device-groups';
import { HomeDataBoundary } from '../home/home-data-boundary';
import { AvailabilityNotice } from '../home/availability-notice';
import { getRoomSummary } from '../../domain/selectors';
import { useRepository } from '../../app/services';

export function RoomPage() {
  const readOnly = useRepository().readOnly;
  const { roomId } = useParams();
  return <HomeDataBoundary>{(home) => {
    const room = home.rooms.find((item) => item.id === roomId);
    if (!room) return <><Link to="/rooms" className="text-link"><ArrowLeft size={16} aria-hidden="true" />Back to rooms</Link><StatePanel kind="empty" title="Room not found" description="This room may have been removed. You can find your current rooms in the overview." /></>;
    const floor = home.floors.find((item) => item.id === room.floorId);
    const devices = home.devices.filter((device) => device.roomId === room.id);
    const summary = getRoomSummary(devices);
    return <div className="page room-page"><Link to="/rooms" className="text-link back-link"><ArrowLeft size={16} aria-hidden="true" />All rooms</Link>
      <div className="room-intro"><div><PageHeading eyebrow={floor?.name ?? 'Your room'} title={room.name} description={room.description} />
        <dl className="room-summary" aria-label="Room status">
          <div><dt>Devices</dt><dd>{summary.online} / {summary.total} online</dd></div>
          <div><dt>Active</dt><dd>{summary.active} {summary.active === 1 ? 'device' : 'devices'}</dd></div>
          {summary.temperature !== null && <div><dt>Temperature</dt><dd>{summary.temperature.toFixed(1)}°C</dd></div>}
          {summary.humidity !== null && <div><dt>Humidity</dt><dd>{summary.humidity.toFixed(0)}%</dd></div>}
        </dl></div>
        {room.image && <img className="room-intro__image" src={room.image} alt="" style={{ objectPosition: room.imagePosition }} width="800" height="520" />}
      </div>
      <AvailabilityNotice devices={devices} rooms={home.rooms} readOnly={readOnly === true} />
      <DeviceGroups devices={devices} rooms={home.rooms} />
    </div>;
  }}</HomeDataBoundary>;
}
