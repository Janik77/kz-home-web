import { expect, it } from 'vitest';
import { createRunHistory } from './run-history';
it('bounds references, strips extra fields, deduplicates and isolates contexts', () => {
  const a = createRunHistory(), b = createRunHistory();
  for (let i = 0; i < 25; i++) a.remember({ id: String(i), sceneId: 'scene', createdAt: '2026-11-13T00:00:00Z' });
  expect(a.getSnapshot()).toHaveLength(20); expect(a.getSnapshot()[0]!.id).toBe('24'); expect(b.getSnapshot()).toEqual([]);
  const before = a.getSnapshot(); a.remember(before[0]!); expect(a.getSnapshot()).toBe(before);
  a.remember({ id: 'safe', sceneId: 'other', createdAt: '2026-11-13T00:00:00Z', token: 'must-not-retain' } as Parameters<typeof a.remember>[0]);
  expect(a.getSnapshot()[0]).toEqual({ id: 'safe', sceneId: 'other', createdAt: '2026-11-13T00:00:00Z' });
});
