# Управление описаниями сценариев и правил

Ветка основана на Web #11 (`92d0134`), который включает #10. Live CI использует
те же зафиксированные Core #32 + точный diff #33 и Docker digest. Runtime Core
и физические gates не меняются.

Реальные операции: POST /scenes (название и 1–100 явных ON/OFF-действий),
PATCH /scenes/{id} и PATCH /automations/{id} только с полем name. Название
ограничено 255 символами; действия выбираются только из отображаемых ON/OFF
устройств выбранного дома. Core проверяет принадлежность устройств дому.

Сохранение само по себе не исполняет действия: это проверено в SceneService
и AutomationService. Перед каждой записью Web запрашивает актуальные права
scene.read/manage либо automation.read/manage. Переименование читает текущую
запись, проверяет дом, ID и исходное название, затем отправляет минимальный
PATCH; действия, условия, enabled и прочие поля не перезаписываются.
После записи выполняется отдельное чтение. Нет автоматического повтора записи,
оптимистичного сообщения об успехе или подстановки mock-данных при ошибках.
Abort при размонтировании/смене дома и lifetime/revision сессии предотвращают
запоздалое отображение результата в другом контексте. Отмена HTTP-наблюдения
не гарантирует отмену уже принятой Core записи.

Черновик остаётся в форме при ошибке сохранения. Его ID сохраняется при повторе
создания, что не даёт незаметно создать вторую копию после потерянного ответа.
После неопределённого результата следует проверить список. Черновики не
сохраняются в storage и теряются при выходе/переходе на другую страницу; форма
прямо сообщает об этом. Core не предоставляет ETag/условный PATCH: предварительное
сравнение имени обнаруживает уже произошедший конфликт, но не закрывает гонку
между GET и PATCH. Атомарный контроль версии требует изменения API.

Core действительно имеет run/enable/disable endpoints. Они не подключены этим
этапом: выполнение SceneService вызывает legacy update_state последовательно,
без группового confirmed receipt; включённые правила могут выполнить действия
по событиям. Здесь реализовано безопасное редактирование описаний, не запуск.
Создание/редактирование trigger/actions автоматизаций, переключение enabled,
удаление и редактирование существующих actions остаются вне текущего объёма.

Проверки: npm run typecheck; npm run lint; npm test; npm run build;
npm run test:e2e:core; workflow Live Web Core MQTT software relay. Новый live
сценарий создаёт описание сцены, переименовывает сцену и отключённое тестовое
правило, сверяет повторное чтение Core и отсутствие дополнительных MQTT-команд.
Никакие реальные физические устройства, production или секреты не используются.

## Conditional revision integration (continuation of Web #12)

This continuation requires Core #35 at `9a6283c260c92acfe0447b0c425668cbb1a64002`
(based on #32), with migration `0009_definition_revisions`. The isolated live
workflow applies the same exact #33 transport delta to that disposable checkout.
No production migrations or deploys are performed.

The editor captures revision when opened and sends `expected_revision` in its
minimal name PATCH. The server, not Web's preflight GET, supplies atomic CAS.
Success requires the PATCH response to increment revision and a matching GET
readback. A missing revision disables renaming while retaining read access and
scene creation. Web never falls back to unconditional PATCH or silently adopts
a newly fetched revision. HTTP 409 preserves the draft and its captured version.
Refresh shows the current name/version; only the explicit comparison button
adopts that version, preserving the user's draft, and a separate Save is required.
A second race can still conflict. Network ambiguity never triggers a hidden retry.

This supersedes the preflight-only limitation above for Core #35. Normal ABA
(name A → B → A) and legacy PATCH clients are detected because every write
increments revision. Legacy clients themselves still lack stale-draft protection.
Counters apply to one record lifetime: delete/recreate of the same ID, database
restore/downgrade, external SQL and mixed old/new Core writers are outside this
contract. Close old drafts after such operations; upgrade all Core writers together.
A response revision is a contract prerequisite, not proof against out-of-band writers.

Regression coverage includes missing/invalid revisions, 409 without replay,
two independent clients, response/readback verification, actual two-browser
PATCH races against isolated PostgreSQL/Core, explicit reconciliation and legacy
ABA for both scenes and automations. Definition tests assert preserved actions,
trigger/conditions/enabled and zero additional MQTT commands. Existing 18-command
software-relay verification remains active, with no physical identities or commands.
