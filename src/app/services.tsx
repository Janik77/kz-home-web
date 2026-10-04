import { createContext, useContext } from 'react';
import type { HomeRepository } from '../data/home-repository';

const RepositoryContext = createContext<HomeRepository | null>(null);
export const RepositoryProvider = RepositoryContext.Provider;

// eslint-disable-next-line react-refresh/only-export-components -- colocated typed context accessor
export function useRepository() {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('Home repository is not configured.');
  return repository;
}
