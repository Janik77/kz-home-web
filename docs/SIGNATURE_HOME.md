# KZ Home Signature — Home desktop / mobile

Реализовано по приложенному утверждённому референсу. Область: Home и общие
элементы оболочки. Другие страницы сохраняют существующую реализацию v0.5.
Незакоммиченные изменения предыдущего v0.5 сохранены.

## Визуальная реализация

- Graphite `#101214` и тёплый ivory `#f5f2ec`; компактный sidebar 208px,
  rail 88px на планшете, нижняя навигация на телефоне.
- Фото справа в приветствии, дата браузера, фактические показатели из snapshot;
  затем быстрые сценарии, фотосетка комнат, устройства и доступность.
- Четыре сценария и две колонки комнат на мобильном, включая 320px.
- Русские тексты Home и навигации, локальный Manrope с кириллицей. Названия
  объектов Core сохраняются; переводятся только известные имена mock-примера.
  Это презентация Web, без нового backend localization API.
- Локальные существующие фото с provenance в [ASSETS.md](ASSETS.md), без
  новых загрузок, зависимостей и hotlink. Core не получает фиктивные фотографии.
  Отсутствующая/сломанная фотография заменяется нейтральной карточкой с иконкой.
- Native controls, 44px switch/slider targets, focus, skip link, reduced motion.
  Переходы фотографий и hover отключаются при reduced motion.

## Данные и безопасность

Core: все устройства, только просмотр, явная подпись источника; refresh и
переход к аккаунту/домам сохранены. Нет mutation-кнопок, sliders и switches.
Transport, session, refresh/logout, DTO mapping и repository guards не изменены.

Mock: интерактивная симуляция через существующий repository и TanStack mutations.
Метка демо видна сразу на мобильном. Подтверждение всегда называется результатом
симуляции; offline отключает управление и исключает устройство из active.
Последнее ON/brightness остаётся видимым как последнее состояние, без вывода
об онлайн-доступности. Pending, ошибка и retry отделены от результата.

Средняя температура вычисляется только из присутствующих значений online
устройств. Core не гарантирует свежесть измерений: время актуальности неизвестно.
Нет погоды, выдуманной геолокации, имени пользователя или проверки здоровья MQTT.
Отказ Core и restricted access заменяют Home отдельным сообщением; это не offline
отдельного устройства. Пустые комнаты/устройства/сценарии имеют пустые состояния.

## Отличия от референса

Использованы существующие лицензированные фотографии, а не изображения из макета.
Приветствие нейтральное: Core не предоставляет имя «Алексей». Погода заменена
фактической средней температурой либо «Нет измерений». Система не называется
исправной без проверки. Комнаты, их порядок/счётчики и устройства отражают snapshot:
в mock есть кабинет, нет ванной и кондиционера. Сценарий «Уютный вечер» сохранён
вместо выдуманного «Я дома». У штор доступны только поддержанные simulated позиции
0/100, без несуществующей команды pause. Кнопка темы заменяет неподдержанный add.
Не добавлены отсутствующие маршруты автоматизации/отдельного списка устройств.
Длинные названия и явные пояснения источника могут увеличивать высоту карточек.
Мобильные избранные устройства расположены ниже сетки комнат и доступны скроллом.

## Проверки

В Windows / установленном Chrome:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
$env:VITE_DATA_MODE = 'mock'
npm.cmd run build
$env:VITE_DATA_MODE = 'core'
$env:VITE_API_URL = '/core-api'
npm.cmd run build
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run test:e2e
npm.cmd run test:e2e:core
git diff --check
```

Результаты: 76 unit tests; 25 mock Playwright и 20 Core-contract Playwright.
Матрица: 1440, 1024, 834, 390, 320px, обе темы, axe WCAG A/AA, отсутствие
overflow, navigation, клавиатура/reduced motion, реальные mock mutations,
read-only Core, сессия, пустые данные и permissions. После финальной корректировки
плотности повторены Home visual/accessibility и основной Core browser flow
на всех пяти размерах. Новые unit cases проверяют broken-photo fallback,
Core без фото/контролов, offline ON, пустой дом и русские формы числительных.

Core-contract использует перехваченные fixtures, **не live E2E**. Селекторы
существующего `e2e/live-core.spec.ts` актуализированы, сам live suite не запускался:
он создаёт и удаляет fixtures в Core; текущая задача запрещает изменения его данных.
Ни Core, ни Docker, ни реальные аккаунты/устройства этой работой не изменялись.
Физические устройства, live authentication и полная ручная проверка screen reader
не проверялись в этом задании.

## Просмотр и скриншоты

Для самостоятельного mock-preview (переменная только в текущей PowerShell-сессии):

```powershell
cd C:\projects\kz-home-web
$env:VITE_DATA_MODE = 'mock'
npm.cmd run dev -- --port 5192 --strictPort
# http://127.0.0.1:5192 — остановка Ctrl+C
```

Скриншоты mock Home, без перехвата запросов: `test-results/signature/` (Git ignored).
`home-desktop-dark.png`, `home-desktop-light.png` — viewport 1440×1000;
`home-mobile-dark.png`, `home-mobile-light.png` — viewport 390×844.
Варианты с суффиксом `-full` показывают всю страницу. `capture.mjs` рядом с ними
содержит использованную процедуру захвата, `manifest.json` — размеры и тему.

## Файлы именно этого задания

Изменены:

- `docs/ASSETS.md`, `docs/DESIGN_SYSTEM.md`
- `e2e/home.spec.ts`, `e2e/core.spec.ts`, `e2e/live-core.spec.ts`
- `src/app/app-shell.tsx`, `src/app/core-workspace.test.tsx`
- `src/components/ui/state-panel.tsx`
- `src/features/home/home-data-boundary.tsx`, `src/features/home/home-page.tsx`
- `src/main.tsx`

Созданы:

- `docs/SIGNATURE_HOME.md`
- `src/components/ui/interior-photo.tsx`
- `src/features/home/signature-copy.ts`
- `src/features/home/signature-home.test.tsx`
- `src/styles/signature.css`

Остальные изменения ниже существовали до начала задания. Новых зависимостей,
секретов или локальных env-файлов это задание не добавляло.

Следующий небольшой этап: визуальное согласование Home по четырём скриншотам;
после него перенос утверждённых общих primitives на Rooms/Room Detail.

## Финальный Git status

Web: `feature/premium-redesign-v0.5`, 28 modified + 7 untracked, включая
сохранённые предыдущие изменения. Index не изменялся, коммитов/PR не создавалось.

```text
 M README.md
 M docs/ASSETS.md
 M docs/DESIGN_SYSTEM.md
 M e2e/core.spec.ts
 M e2e/home.spec.ts
 M e2e/live-core.spec.ts
 M package-lock.json
 M package.json
 M src/app/app-shell.tsx
 M src/app/core-workspace.test.tsx
 M src/components/ui/state-panel.tsx
 M src/data/core/mapping.test.ts
 M src/features/auth/login-page.tsx
 M src/features/devices/device-card.tsx
 M src/features/devices/device-grid.test.tsx
 M src/features/home/home-data-boundary.test.tsx
 M src/features/home/home-data-boundary.tsx
 M src/features/home/home-page.tsx
 M src/features/home/home-summary.tsx
 M src/features/rooms/room-card.tsx
 M src/features/scenes/scene-controls.test.tsx
 M src/features/scenes/scene-controls.tsx
 M src/features/settings/settings-page.tsx
 M src/main.tsx
 M src/styles/components.css
 M src/styles/global.css
 M src/styles/layout.css
 M src/styles/tokens.css
?? docs/PREMIUM_REDESIGN_V0.5.md
?? docs/SIGNATURE_HOME.md
?? src/components/ui/interior-photo.tsx
?? src/components/ui/theme-toggle.tsx
?? src/features/home/signature-copy.ts
?? src/features/home/signature-home.test.tsx
?? src/styles/signature.css
```

Core: `main`, без изменений от этого задания. Единственный уже существовавший diff:

```text
 M deploy/MENTOR_DEMO_RU.md
```

SHA256 этого файла до/после одинаков:
`0ADE5B0B8DCDA72C8F5266E40EDC316C57B3802DC15ACFAD34501E1DE9C53838`.
Ветки не менялись. Docker, Firmware и данные не затрагивались.
