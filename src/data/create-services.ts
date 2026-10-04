import type { Environment } from '../config/environment';
import { createMockHomeRepository } from './mock/mock-home-repository';
import { HttpClient } from './core/http-client';
import { CoreSession } from './core/session';
import { createCoreHomeRepository } from './core/core-home-repository';

export function createServices(config: Environment, fetcher?: typeof fetch) {
  if (config.mode === 'mock') return { mode: 'mock' as const, repository: createMockHomeRepository() };
  const session = new CoreSession(new HttpClient(config.apiUrl, fetcher));
  return { mode: 'core' as const, session, repositoryForHouse: (id: string) => createCoreHomeRepository(session, id) };
}
