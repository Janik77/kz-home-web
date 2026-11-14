import { HomeDataBoundary } from './home-data-boundary';
import { DeviceGrid } from '../devices/device-grid';
import { useRepository } from '../../app/services';
import { EverydayHeader, EverydayRooms, QuickScenes, RecentEvents, SectionTitle } from './everyday-sections';
export function HomePage() {
  const core = useRepository().readOnly;
  return <HomeDataBoundary household>{home => {
    const favorites = core ? home.devices : home.devices.filter(d => d.favorite);
    return <div className={`everyday-page everyday-home ${favorites.length <= 2 ? 'everyday-home--sparse' : ''}`}>
      <EverydayHeader home={home} title={home.house.name} subtitle="Ваше пространство" />
      <QuickScenes home={home} />
      <div className="everyday-home-grid"><section className="everyday-devices"><SectionTitle title={core ? 'Устройства дома' : 'Избранное'} to="/devices" link="Все устройства" />
        {favorites.length ? <DeviceGrid devices={favorites} rooms={home.rooms} everyday /> : <p className="everyday-empty">{home.devices.length ? 'Избранных устройств пока нет. Все устройства доступны в общем списке.' : 'Устройств пока нет.'}</p>}
      </section><aside className="everyday-overview"><EverydayRooms home={home} /><RecentEvents home={home} /></aside></div>
    </div>;
  }}</HomeDataBoundary>;
}
