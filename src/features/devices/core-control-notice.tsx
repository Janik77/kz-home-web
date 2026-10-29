import type { Device } from '../../domain/home';

/** Current integration boundary, not a device outcome or a claim about user permissions.
 * See docs/REAL_DEVICE_CONTROL_V0.6.md before changing this read-only behavior.
 */
export function CoreControlNotice({ device, locale = 'en' }: { device: Device; locale?: 'en' | 'ru' }) {
  const ru = locale === 'ru';
  const reason = device.connection === 'offline'
    ? ru ? 'Core сообщает, что устройство не в сети.' : 'Core reports this device offline.'
    : device.kind === 'sensor' || device.kind === 'other'
      ? ru ? 'Для этих данных нет поддержанного управления Web.' : 'Web has no supported control for this reported data.'
      : ru ? 'Управление Core остаётся в режиме просмотра.' : 'Core controls remain read-only.';
  return <details className="core-control-notice" lang={locale}>
    <summary>{ru ? 'Почему управление недоступно' : 'Why controls are unavailable'}</summary>
    <p>{reason}</p>
    <p>{ru ? 'Результат команды пока нельзя надёжно проверить. Управление отключено; совпадение состояния не подтверждает выполнение вашей команды.' : 'This integration cannot yet verify a command’s outcome. Controls are unavailable; a matching state does not confirm your command was applied.'}</p>
    <p>{ru ? 'Обновление показывает данные Core; их свежесть неизвестна. Права на управление из этих данных не определяются.' : 'Refresh shows Core-reported data; freshness is unknown. These reads do not establish control permission.'}</p>
  </details>;
}
