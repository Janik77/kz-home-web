# Live Web → Core → MQTT software relay

Этот тест развивает существующий confirmed-live runner. Он не заменяет HTTP
fixtures в обычном Web CI и не выдаёт их за live-проверку.

## Зафиксированные зависимости

- Web #10: `6e1ca5c9c9cb2f7b5e46c042486fa343e07736d2` — база отдельного draft PR.
- Core #32: `159eb98f2349b1aa2b8afd313c3a3f1fbf9b6bd2`.
- Поверх него точный diff Core #33:
  `bbb9d7af8647ecc727b9c8201a936f66fa99a91e` относительно
  `2359807c2781ce956ed43bc603772b66dd27955b`.

CI применяет diff только в одноразовом checkout. Никакие ветки Core не меняются
и не merge-ятся. Docker lifecycle адаптирован из Services fixture Firmware #11
(`0117b7e3a91171dc1fd31298ed1aed8ec3c1fe83`).

## Что действительно запускается

Chromium открывает существующий Vite Web в Core mode. Запросы проходят через
обычный Vite proxy и прозрачный HTTP proxy runner к настоящему uvicorn/Core.
Proxy способен задержать уже полученный реальный ответ для проверки гонок;
он не создаёт и не подменяет ответы API. Затем Core публикует MQTT SET в
Mosquitto TLS, существующий `simulator.mqtt_relay.Relay` обрабатывает его и
отправляет ACK/state. Core сохраняет receipt в настоящем PostgreSQL.

Тест сверяет command_id/correlation_id во всех звеньях, ACK/status, reported state,
независимые SQL-результаты, pending без оптимистичного изменения, повторные клики,
отрицательный ACK, настоящий таймаут 30 секунд, offline, роли, отзыв доступа,
смену дома, logout и деактивацию пользователя. Никаких FakeMQTT/ASGITransport/
Playwright route.fulfill или изменений command gate здесь нет.

## Границы изоляции

- Случайные имена собственных контейнеров и отдельного bridge; порты DB/broker
  публикуются только на `127.0.0.1`, Core/control/proxy/Web тоже на loopback.
- База и данные broker находятся в tmpfs; TLS CA, пароли и JWT-ключ генерируются
  только на время запуска. Production .env, volumes и адреса не читаются.
- Только две MQTT-учётные записи: Core и software relay. ACL разрешает SET лишь
  для `fixture_house/fixture_relay`; физические control-команды запрещены.
- Пара software relay явно задана через штатный `Settings.mqtt_software_devices`.
  Это доверенная конфигурация одноразового стенда, не эвристика по имени устройства.
- Таблица physical_devices пуста до и после прогона. Core ControlAuthority
  остаётся штатной, с закрытым физическим допуском.
- `app_env="production"` включает штатные проверки PostgreSQL/TLS и предотвращает
  чтение `.env`; это не соединение с production, все адреса созданы фикстурой.
- Workflow использует только `contents: read`, без repository secrets, дополнительных прав токена,
  privileged-контейнеров, device mounts и изменения production runtime.
- Cleanup проверяет ownership labels и удаляет только собственные временные
  ресурсы. Отчёт сравнивает Docker inventory до/после, включая чужие ресурсы.
  PR и его ветка сохраняются.

## Воспроизведение

Проще всего выполнить workflow **Live Web Core MQTT software relay** на этой
ветке в GitHub Actions. Для Linux-машины с Docker, Node 24 и Python 3.12:

1. Подготовить указанные checkout Web/Core и применить точный diff #33 как в workflow.
2. Создать venv, установить Core `requirements-dev.txt`; в Web выполнить `npm ci`
   и `npx playwright install --with-deps chromium`.
3. Заранее загрузить `postgres:17-bookworm`, `eclipse-mosquitto:2`,
   `alpine/openssl:latest` (до baseline inventory).
4. Запустить из Web:

```sh
LIVE_CORE_SOURCE=/absolute/path/to/core /path/to/venv/bin/python -B e2e/confirmed-live-runner.py
```

Не указывать установленную систему или её базу: runner сам создаёт стенд и
не принимает production URL. Артефакты `confirmed-live-evidence.json`,
`confirmed-live-preservation.json`, `live-software-desktop.png`, `live-software-mobile.png` не содержат
паролей, токенов или ключей. Trace/video и автоматические снимки форм входа
отключены. Успех этого теста не является квалификацией физического оборудования.
