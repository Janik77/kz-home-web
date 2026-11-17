import { useMutation, useQuery, useQueryClient, useIsMutating } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import { CoreError } from '../../data/core/errors';
import type { DeviceCommand, SceneResult } from '../../domain/home';

export const homeKey = ['home', 'current'] as const;
const controlsKey = ['home-controls'] as const;

// Only the shell owns the timer. Other consumers share this query/cache.
export const liveHomeInterval = 5_000;
export function isLiveHomePage(pathname: string) {
  return pathname === '/' || /^\/devices\/[^/]+\/?$/.test(pathname);
}

export function useHome({ live = false }: { live?: boolean } = {}) {
  const repository = useRepository();
  return useQuery({
    queryKey: homeKey, queryFn: ({ signal }) => repository.getHome(signal),
    ...(live ? {
      retry: false,
      staleTime: liveHomeInterval,
      refetchOnWindowFocus: 'always' as const,
      refetchOnReconnect: 'always' as const,
      refetchIntervalInBackground: false,
      refetchInterval: (query: { state: { error: Error | null; fetchFailureCount: number } }) => {
        const error = query.state.error;
        if (error instanceof CoreError && ['unauthorized', 'forbidden', 'not-found'].includes(error.kind)) return false;
        // No immediate retry storm while Core is unavailable.
        return error ? 30_000 : liveHomeInterval;
      },
    } : {}),
  });
}

export function useHomeControls() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const pending = useIsMutating({ mutationKey: controlsKey }) > 0;
  const command = useMutation({
    mutationKey: controlsKey,
    scope: { id: 'home-controls' },
    mutationFn: (input: DeviceCommand) => repository.sendCommand(input),
    onMutate: () => queryClient.cancelQueries({ queryKey: homeKey }),
    onSuccess: (home) => queryClient.setQueryData(homeKey, home),
  });
  const scene = useMutation({
    mutationKey: controlsKey,
    scope: { id: 'home-controls' },
    mutationFn: (id: string) => repository.activateScene(id),
    onMutate: () => queryClient.cancelQueries({ queryKey: homeKey }),
    onSuccess: (result: SceneResult) => queryClient.setQueryData(homeKey, result.home),
  });
  return { command, scene, pending, readOnly: repository.readOnly === true };
}
