/** Non-secret navigation aids only; scoped to one authenticated repository instance.
 * No browser persistence, payloads, tokens, idempotency keys or cached outcomes. */
export interface RunReference { id: string; sceneId: string; createdAt: string }
export interface RunHistory {
  getSnapshot(): readonly RunReference[];
  subscribe(listener: () => void): () => void;
  remember(reference: RunReference): void;
}
export function createRunHistory(): RunHistory {
  let entries: readonly RunReference[] = [];
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => entries,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    remember(reference) {
      if (entries.some(e => e.id === reference.id && e.sceneId === reference.sceneId)) return;
      entries = [{ id: reference.id, sceneId: reference.sceneId, createdAt: reference.createdAt }, ...entries].slice(0, 20);
      for (const listener of listeners) listener();
    },
  };
}
