import { useMutation, useQuery, useQueryClient, useIsMutating } from '@tanstack/react-query';
import { useRepository } from '../../app/services';
import type { DeviceCommand, SceneResult } from '../../domain/home';

export const homeKey = ['home', 'current'] as const;
const controlsKey = ['home-controls'] as const;

export function useHome() {
  const repository = useRepository();
  return useQuery({ queryKey: homeKey, queryFn: ({ signal }) => repository.getHome(signal) });
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
