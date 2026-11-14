# Продолжение принятого интерфейса #21

Основа — Web `dc05b09f02243c41423023179bcf21d65f5e288f` (владелец принял
мобильную композицию). Ветка `feat/complete-everyday-interface`, draft PR #22.
Контракт live-проверки — Core `82653a849d2b61479de1c3bb4d74e7f388523667`.
Исторический HOME_ROOM_COMPOSITION описывает предыдущий этап; текущий объём ниже.

Единая система распространяется на Home, Rooms/Room, Devices/details, Scenes,
Rules, Events, Settings, вход и выбор дома. Desktop Home использует общую сетку
для устройств и комнат: 1280/1440/1920 px, отдельная композиция одного прибора.
Успешное подтверждение команды появляется без изменения высоты карточки.
Ошибка и неизвестный результат остаются видимыми. Мобильная навигация и
композиция принятой главной/комнаты сохранены.

## Просмотр без оборудования

Git, Node 24/npm. Новый каталог, без изменения существующего checkout:

```sh
git clone --branch feat/complete-everyday-interface https://github.com/Janik77/kz-home-web.git kz-home-web-interface
cd kz-home-web-interface
# Для точного результата: git checkout --detach <Web SHA из итогового отчёта PR>
npm ci
VITE_DATA_MODE=mock npm run dev -- --host 127.0.0.1 --port 5173
```

`http://127.0.0.1:5173/?demo=one`: один прибор; `?demo=many`: десять;
`?demo=empty`: пустая комната; `?demo=offline`: недоступный прибор;
`?demo=vacant`: пустой дом без комнат, приборов, сценариев и событий.
Комната: `/rooms/living?demo=one` (также many/empty/offline).
Тема переключается в верхней панели. Demo отдельно обозначено, сбрасывается
при перезагрузке и не обращается к Core. Избранное demo не является серверным.

Уже запущенный изолированный Core на loopback — отдельный режим:

```sh
CORE_DEV_PROXY_TARGET=http://127.0.0.1:8000 VITE_DATA_MODE=core VITE_API_URL=/core-api npm run dev -- --host 127.0.0.1 --port 5173
```

Адрес и учётная запись берутся из своего тестового Core. Demo-параметр не
подменяет реальные данные. Persistent launcher/profile bindings не менялись;
запуск новой пары через него требует отдельной согласованной интеграции.
Публичного deploy или временного внешнего адреса этот PR не создаёт.

## Воспроизведение проверок

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:core
node scripts/capture.mjs
node scripts/capture-home-room.mjs
```

Contract suite перехватывает HTTP и не заменяет live. Matrix: 72 PNG — Home/Room,
390/1280/1440/1920, две темы, one/many/empty/offline; vacant только Home.
Manifest проверяет overflow, шрифты >=13 px, действия >=44 px, реальную пустоту,
компактный Room. Общая съёмка — все разделы при пяти размерах в обеих темах;
вход снимается в Core-режиме, выбор дома отдельно в contract suite.

Live workflow `.github/workflows/live-software.yml` проверяет точный head PR,
Core #42, PostgreSQL 17 и Mosquitto TLS (образы закреплены digest).
Software relay — Python-эмулятор из Core, исходники Firmware не требуются.
Программные ACK/state и записи SQL сверяются по всем command/correlation ID;
отдельно проверяются scene partial/timeout, роли, отзыв доступа, смена дома,
двойные клики, независимые редакторы, revision/ABA и сохранение черновиков.
Создание дома/этажа/комнаты и изменение определений не отправляют команды.
Видео записывает настоящий браузер после входа, без паролей и синтетических кадров.

Для самостоятельного live прогона нужен Linux/WSL с уже работающим Docker
и системными библиотеками Chromium, Python 3.12 и Node 24. В соседнем каталоге
клонируйте Core и checkout указанного выше точного SHA. Из Web:

```sh
python3.12 -m venv ../kz-interface-venv
../kz-interface-venv/bin/python -m pip install -r ../kz-home-core/requirements-dev.txt
../kz-interface-venv/bin/python -m pip check
npm ci
npx playwright install chromium
docker pull postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994
docker pull eclipse-mosquitto:2@sha256:75d6662dee52c947dc9dd9c29f1d8d7ffef78ddaf38001caa09755681e8bbc98
docker pull alpine/openssl:latest@sha256:6821afa2476e11be343f29275f2ca24291720ff0a7148bd131fd8e314ff26d9e
LIVE_CORE_SOURCE="$(cd ../kz-home-core && pwd)" ../kz-interface-venv/bin/python -B e2e/confirmed-live-runner.py
```

Это автоматическая одноразовая проверка, не пользовательский persistent стенд:
случайные loopback-порты, временные аккаунты/TLS, собственные контейнеры/tmpfs,
последующая очистка только созданной фикстуры и проверка сохранности окружения.
Не запускайте этот сценарий для физических устройств. CI дополнительно делает
историческое сравнение сцены с #18 и полный regression suite Core.

## Границы результата и следующие зависимости

Поддержанные операции и точные независимые задачи Core описаны в
[INTERFACE_CORE_GAPS.md](INTERFACE_CORE_GAPS.md). Для текущего Web нет новой
миграции: используется уже существующая Core `0010_scene_runs`.
Персональное избранное и атомарное metadata-editing требуют новых контрактов и
миграций Core, затем отдельных Web PR. Полный trigger/action editor, onboarding
реального оборудования и полный аудит истории не заявляются готовыми.
Ни визуальная проверка, ни applied ACK/state программного реле не являются
проверкой физического устройства или доказательством физического OFF.
