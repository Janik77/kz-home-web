import type { DeviceCommand, HomeSnapshot, SceneResult } from '../domain/home';

/** An application boundary, not an HTTP API. Core transport and mapping belong in an adapter. */
export interface HomeRepository {
  readonly readOnly?: boolean;
  getHome(signal?: AbortSignal): Promise<HomeSnapshot>;
  sendCommand(command: DeviceCommand): Promise<HomeSnapshot>;
  activateScene(sceneId: string): Promise<SceneResult>;
}
