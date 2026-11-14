import { designFixture } from './mock/design-fixtures';
import type { Environment } from '../config/environment';
import { createMockHomeRepository } from './mock/mock-home-repository';
import { HttpClient } from './core/http-client';
import { CoreSession } from './core/session';
import { createCoreHomeRepository } from './core/core-home-repository';

export function createServices(config: Environment, fetcher?: typeof fetch) {
  if (config.mode === 'mock') {
    const variant = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('demo');
    const repository = createMockHomeRepository(designFixture(variant));
    return { mode: 'mock' as const, repository: ['one', 'empty', 'offline', 'unavailable'].includes(variant ?? '') ? { ...repository, activity: { automations: async () => [], events: async () => [] } } : repository };
  }
  const session = new CoreSession(new HttpClient(config.apiUrl, fetcher));
  return { mode: 'core' as const, session, repositoryForHouse: (id: string) => createCoreHomeRepository(session, id) };
}
