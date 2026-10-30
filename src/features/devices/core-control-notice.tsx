import type { Device } from '../../domain/home';

/** Read eligibility is distinct from command permission and confirmation. */
export function CoreControlNotice({ device, locale = 'en' }: { device: Device; locale?: 'en' | 'ru' }) {
  const ru = locale === 'ru';
  const reason = device.connection === 'offline'
    ? ru ? 'Core сообщает, что устройство не в сети.' : 'Core reports this device offline.'
    : device.kind === 'sensor' || device.kind === 'other'
      ? ru ? 'Для этих данных нет поддержанного управления Web.' : 'Web has no supported control for this reported data.'
      : ru ? 'Управление доступно только при подтверждённых правах и поддержке реле.' : 'Control requires verified permission and a supported relay.';
  return <details className="core-control-notice" lang={locale}>
    <summary>{ru ? 'Почему управление недоступно' : 'Why controls are unavailable'}</summary>
    <p>{reason}</p>
    <p>{ru ? 'Подтверждение команды требует результата applied от Core v0.15; совпадение состояния не подтверждает выполнение вашей команды.' : 'Command confirmation requires an applied result from Core v0.15; a matching state does not confirm your command was applied.'}</p>
    <p>{ru ? 'Обновление показывает данные Core; их свежесть неизвестна. Права на управление из этих данных не определяются.' : 'Refresh shows Core-reported data; freshness is unknown. These reads do not establish control permission.'}</p>
  </details>;
}
