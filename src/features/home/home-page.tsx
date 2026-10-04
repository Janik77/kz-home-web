import { ArrowUpRight, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../components/ui/page-heading';
import { SectionHeading } from '../../components/ui/section-heading';
import { DeviceGrid } from '../devices/device-grid';
import { RoomGrid } from '../rooms/room-grid';
import { SceneControls } from '../scenes/scene-controls';
import { HomeDataBoundary } from './home-data-boundary';
import { HomeSummary } from './home-summary';
import { AvailabilityNotice } from './availability-notice';

export function HomePage() {
  return <HomeDataBoundary>{(home) => <div className="page home-page">
    <PageHeading eyebrow={home.house.name} title="Home" description="Status and everyday controls, together."
      action={<span className="location-label"><MapPin size={15} aria-hidden="true" />{home.house.location}</span>} />
    <HomeSummary home={home} />
    <AvailabilityNotice devices={home.devices} rooms={home.rooms} />
    <section aria-labelledby="favorites-title"><SectionHeading id="favorites-title" title="Favorites" description="Your frequently used devices." /><DeviceGrid devices={home.devices.filter((device) => device.favorite)} rooms={home.rooms} /></section>
    <section aria-labelledby="rooms-title"><SectionHeading id="rooms-title" title="Rooms" action={<Link className="text-link" to="/rooms">All rooms <ArrowUpRight size={16} aria-hidden="true" /></Link>} /><RoomGrid home={home} /></section>
    <section aria-labelledby="scenes-title"><SectionHeading id="scenes-title" title="Scenes" action={<Link className="text-link" to="/scenes">All scenes <ArrowUpRight size={16} aria-hidden="true" /></Link>} /><SceneControls home={home} /></section>
  </div>}</HomeDataBoundary>;
}