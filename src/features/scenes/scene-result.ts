import type { SceneResult } from '../../domain/home';

export function sceneFeedback(name: string, result: SceneResult): { tone: 'success' | 'warning'; message: string } {
  const skipped = `${result.skipped} ${result.skipped === 1 ? 'control' : 'controls'} skipped (offline or unavailable).`;
  if (result.applied === 0) {
    return { tone: 'warning', message: result.skipped ? `${name} didn’t update any devices. ${skipped}` : `${name} has no controls to run.` };
  }
  if (result.skipped > 0) {
    return { tone: 'warning', message: `${name} partially applied · ${result.applied} controls updated · ${skipped}` };
  }
  return { tone: 'success', message: `${name} applied · ${result.applied} controls updated.` };
}