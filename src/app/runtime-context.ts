import { createContext, useContext } from 'react';
import type { AccessibleHouse, SessionUser } from '../domain/session';

export type Runtime = { mode: 'mock' } | {
  mode: 'core'; user: SessionUser; houses: AccessibleHouse[]; houseId: string;
  selectHouse: (id: string) => void; logout: () => void;
};
export const RuntimeContext = createContext<Runtime>({ mode: 'mock' });
export function useRuntime() { return useContext(RuntimeContext); }
