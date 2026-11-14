import { initialHome } from './fixtures';
import type { HomeSnapshot } from '../../domain/home';
export function designFixture(name: string | null): HomeSnapshot {
  const home = structuredClone(initialHome);
  if (['one', 'many', 'empty', 'offline', 'unavailable'].includes(name ?? '')) home.house.name = 'Дом на Садовой';
  if (name === 'many') { home.devices.forEach(d => { d.favorite = true; }); return home; }
  if (!['one', 'empty', 'offline', 'unavailable'].includes(name ?? '')) return home;
  if (name === 'empty') { home.rooms = home.rooms.slice(0, 1); home.devices = []; home.scenes = []; return home; }
  home.rooms = home.rooms.slice(0, name === 'unavailable' ? 2 : 1); home.scenes = [];
  home.devices = [{ id: 'sample-relay', roomId: 'living', name: 'Торшер у дивана', kind: 'relay', on: false, connection: name === 'unavailable' || name === 'offline' ? 'offline' : 'online', favorite: true }];
  return home;
}
