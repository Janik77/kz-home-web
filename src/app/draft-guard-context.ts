import { createContext, useContext, useId, useLayoutEffect } from 'react';

type DraftRegistry = {
  register: (id: string, dirty: boolean, pending: boolean) => void;
  remove: (id: string) => void;
  confirmDiscard: (action: () => void, dirty: boolean) => void;
};
export const DraftGuardContext = createContext<DraftRegistry | null>(null);

/** Draft values remain in their forms; the registry contains only boolean flags. */
export function useDraftGuard(dirty: boolean, pending = false) {
  const registry = useContext(DraftGuardContext);
  const id = useId();
  const register = registry?.register, remove = registry?.remove;
  useLayoutEffect(() => {
    register?.(id, dirty, pending);
    return () => remove?.(id);
  }, [register, remove, id, dirty, pending]);
  return (action: () => void) => {
    if (registry) registry.confirmDiscard(action, dirty);
    else action();
  };
}
