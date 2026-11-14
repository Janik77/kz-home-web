import { expect, it } from 'vitest';
import { designFixture } from './design-fixtures';
import { createServices } from '../create-services';
it('keeps explicit composition fixtures independent and provides sparse/offline and ten-device cases', () => {
  const one = designFixture('one'), many = designFixture('many'), unavailable = designFixture('unavailable');
  expect(one.devices).toHaveLength(1); expect(one.scenes).toEqual([]);
  expect(many.devices).toHaveLength(10); expect(many.rooms).toHaveLength(4);
  expect(unavailable.devices[0]!.connection).toBe('offline'); expect(unavailable.scenes).toEqual([]);
  one.devices[0]!.name = 'Changed'; expect(designFixture('one').devices[0]!.name).toBe('Торшер у дивана');
});
it('cannot turn a Core configuration into demo through a URL fixture selector', () => {
  window.history.replaceState({}, '', '/?demo=one');
  try { expect(createServices({ mode: 'core', apiUrl: '/core-api' }).mode).toBe('core'); }
  finally { window.history.replaceState({}, '', '/'); }
});

it('separates an actually empty room from an offline device without scenes', () => {
  const empty = designFixture('empty'), offline = designFixture('offline');
  expect(empty.rooms.map(room => room.id)).toEqual(['living']);
  expect(empty.devices).toEqual([]); expect(empty.scenes).toEqual([]);
  expect(offline.rooms.map(room => room.id)).toEqual(['living']);
  expect(offline.devices).toHaveLength(1); expect(offline.devices[0]!.connection).toBe('offline');
  expect(offline.scenes).toEqual([]);
});

it('provides an honest vacant house without invented floors or rooms',()=>{const home=designFixture('vacant');expect(home.rooms).toEqual([]);expect(home.floors).toEqual([]);expect(home.devices).toEqual([]);expect(home.scenes).toEqual([]);});
