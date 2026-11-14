import { useFavorites } from '../favorites/favorites-context';
import { HomeDataBoundary } from './home-data-boundary';
import { DeviceGrid } from '../devices/device-grid';
import { useRepository } from '../../app/services';
import { EverydayHeader, EverydayRooms, QuickScenes, RecentEvents, SectionTitle } from './everyday-sections';
export function HomePage() {
  const core = useRepository().readOnly;
  const stored=useFavorites();
  return <HomeDataBoundary household>{home => {
    const saved=stored?.known ? home.devices.filter(d=>stored.ids.includes(d.id)) : [];
    const favorites = core ? saved.length ? saved : home.devices : home.devices.filter(d => d.favorite);
    return <div className={`everyday-page everyday-home ${favorites.length <= 1 ? 'everyday-home--sparse' : favorites.length === 2 ? 'everyday-home--pair' : ''}`}>
      <EverydayHeader home={home} title={home.house.name} subtitle="Ваше пространство" />
      <QuickScenes home={home} />
      <div className="everyday-home-grid"><section className="everyday-devices"><SectionTitle title={core && !saved.length ? 'Устройства дома' : 'Избранное'} to="/devices" link="Все устройства" />
        {core && stored?.known && !saved.length && home.devices.length>0 && <p className="quiet-note">Избранное пока пусто. Отметьте нужные устройства звёздочкой — они появятся здесь.</p>}
        {favorites.length ? <DeviceGrid devices={favorites} rooms={home.rooms} everyday /> : <p className="everyday-empty">{home.devices.length ? 'Избранных устройств пока нет. Все устройства доступны в общем списке.' : 'Устройств пока нет.'}</p>}
      </section><aside className="everyday-overview"><EverydayRooms home={home} /><RecentEvents home={home} /></aside></div>
    </div>;
  }}</HomeDataBoundary>;
}
