import { initialHome } from './fixtures';
import type { HomeSnapshot } from '../../domain/home';
export function designFixture(name: string | null): HomeSnapshot {
  const home = structuredClone(initialHome);
  if (['one', 'many', 'unavailable'].includes(name ?? '')) home.house.name = 'Дом на Садовой';
  if (name === 'many') { home.devices.forEach(d => { d.favorite = true; }); return home; }
  if (name !== 'one' && name !== 'unavailable') return home;
  home.rooms = home.rooms.slice(0, name === 'unavailable' ? 2 : 1); home.scenes = [];
  home.devices = [{ id: 'sample-relay', roomId: 'living', name: 'Торшер у дивана', kind: 'relay', on: false, connection: name === 'unavailable' ? 'offline' : 'online', favorite: true }];
  return home;
}
