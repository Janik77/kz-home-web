export type CoreErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'validation' | 'conflict' | 'server' | 'network' | 'protocol' | 'read-only' | 'rate-limit';

export class CoreError extends Error {
  constructor(public readonly kind: CoreErrorKind, public readonly status?: number) {
    super(`Core request failed: ${kind}`);
    this.name = 'CoreError';
  }
}

export function coreErrorMessage(error: unknown): string {
  if (!(error instanceof CoreError)) return 'Попробуйте ещё раз немного позже.';
  switch (error.kind) {
    case 'rate-limit': return 'Слишком много запросов. Подождите перед повтором.';
    case 'network': return 'Нет соединения с Core. Проверьте сеть и доступность сервера.';
    case 'server': return 'Core временно недоступен. Повторите позже.';
    case 'forbidden': return 'У вашей учётной записи нет прав на просмотр этих данных.';
    case 'not-found': return 'Дом больше недоступен. Выберите другой дом или войдите снова.';
    case 'unauthorized': return 'Сеанс истёк. Войдите снова.';
    case 'protocol': return 'Формат ответа Core несовместим с этой версией Web. Проверьте версии.';
    case 'validation': return 'Проверьте введённые данные и повторите.';
    case 'conflict': return 'Запрос не выполнен. Обновите данные и повторите.';
    case 'read-only': return 'Эта операция недоступна в Web. Данные доступны для просмотра.';
  }
}
