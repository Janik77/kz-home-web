/** Session-only launch intent. Retained across navigation, never persisted to disk.
 * Losing a response must not silently become a new launch. */
export interface SceneIntent { key: string; revision: number; runId?: string }
export function createSceneIntents() {
  const intents = new Map<string, SceneIntent>();
  return {
    get: (scene: string) => intents.get(scene),
    set: (scene: string, intent: SceneIntent) => { intents.set(scene, intent); },
  };
}
