import { ArrowRight, ArrowUpRight, MapPin, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeading } from '../../components/ui/page-heading';
import { SectionHeading } from '../../components/ui/section-heading';
import { DeviceGrid } from '../devices/device-grid';
import { RoomGrid } from '../rooms/room-grid';
import { SceneControls } from '../scenes/scene-controls';
import { HomeDataBoundary } from './home-data-boundary';
import { HomeSummary } from './home-summary';

export function HomePage() {
  return <HomeDataBoundary>{(home) => <div className="page home-page">
    <PageHeading eyebrow="A LITTLE MORE CONNECTED" title="Feels like home." description="Your spaces, your comforts. All in one place."
      action={<span className="location-label"><MapPin size={15} aria-hidden="true" />{home.house.location}</span>} />
    <section className="home-hero" aria-label="Welcome home">
      <img src="/images/living-room.jpg" className="home-hero__image" alt="A warm, sunlit living room with natural textures and comfortable seating" width="1800" height="1200" fetchPriority="high" />
      <div className="home-hero__scrim" /><div className="home-hero__content"><span className="hero-label"><span className="status-dot" />YOUR EVERYDAY, SIMPLIFIED</span>
        <h2>A home that moves<br />with you.</h2><p>From the first light to the last good night.<br />Make every moment feel just right.</p>
        <Link to="/scenes" className="hero-link">Find your moment <ArrowRight size={17} aria-hidden="true" /></Link>
      </div><div className="home-hero__caption"><Sparkles size={15} aria-hidden="true" />Little things. In harmony.</div>
    </section>
    <HomeSummary home={home} />
    <section aria-labelledby="scenes-title"><SectionHeading id="scenes-title" title="One touch, a different mood" action={<Link className="text-link" to="/scenes">All scenes <ArrowUpRight size={16} aria-hidden="true" /></Link>} /><SceneControls scenes={home.scenes} /></section>
    <section aria-labelledby="rooms-title"><SectionHeading id="rooms-title" title="Your rooms" action={<Link className="text-link" to="/rooms">Explore rooms <ArrowUpRight size={16} aria-hidden="true" /></Link>} /><RoomGrid home={home} /></section>
    <section aria-labelledby="favorites-title"><SectionHeading id="favorites-title" title="Everyday favorites" description="The little things you reach for most." /><DeviceGrid devices={home.devices.filter((device) => device.favorite)} rooms={home.rooms} /></section>
  </div>}</HomeDataBoundary>;
}
