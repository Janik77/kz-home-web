import type { SceneResult } from '../../domain/home';

export function sceneFeedback(name: string, result: SceneResult): { tone: 'success' | 'warning'; message: string } {
  const skipped = `Пропущено: ${result.skipped} (нет связи или доступа).`;
  if (result.applied === 0) {
    return { tone: 'warning', message: result.skipped ? `${name}: ни одно устройство не изменено. ${skipped}` : `${name}: нет действий для запуска.` };
  }
  if (result.skipped > 0) {
    return { tone: 'warning', message: `${name}: частично выполнено · обновлено: ${result.applied} · ${skipped}` };
  }
  return { tone: 'success', message: `${name}: выполнено · обновлено: ${result.applied}.` };
}