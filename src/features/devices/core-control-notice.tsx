import type { Device } from '../../domain/home';

/** Read eligibility is distinct from command permission and confirmation. */
export function CoreControlNotice({ device, locale = 'ru' }: { device: Device; locale?: 'en' | 'ru' }) {
  const ru = locale === 'ru';
  const reason = device.connection === 'offline'
    ? ru ? 'Core сообщает, что устройство не в сети.' : 'Core сообщает, что устройство не в сети.'
    : device.kind === 'sensor' || device.kind === 'other'
      ? ru ? 'Для этих данных нет поддержанного управления Web.' : 'Для этих данных нет поддержанного управления Web.'
      : ru ? 'Управление доступно только при подтверждённых правах и поддержке реле.' : 'Control requires verified permission and a supported relay.';
  return <details className="core-control-notice" lang={locale}>
    <summary>{ru ? 'О состоянии и управлении' : 'О состоянии и управлении'}</summary>
    <p>{reason}</p>
    <p>{ru ? 'Подтверждение команды требует результата applied от Core v0.15; совпадение состояния не подтверждает выполнение вашей команды.' : 'Command confirmation requires an applied result from Core v0.15; a совпадение состояния не подтверждает your command was applied.'}</p>
    <p>{ru ? 'Обновление показывает данные Core; их свежесть неизвестна. Права на управление из этих данных не определяются.' : 'Refresh shows Core-reported data; freshness is unknown. These reads do not establish control permission.'}</p>
    <p>Физический допуск проверяет Core. Web не определяет по имени или состоянию, является ли реле физическим. Онлайн-статус и права не гарантируют допуск команды.</p>
  </details>;
}
