import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';

export const mobileReadRefresh = 'kz-home:mobile-read-refresh';

export function useMobileReadRefresh(enabled: boolean, client: QueryClient) {
  useEffect(() => {
    if (!enabled) return;
    // Active query functions read Core; no mutation resume/refetch is invoked here.
    const refresh = () => { void client.invalidateQueries({ type: 'active' }); };
    window.addEventListener(mobileReadRefresh, refresh);
    return () => window.removeEventListener(mobileReadRefresh, refresh);
  }, [enabled, client]);
}
