> Historical Core #37 / legacy-route analysis. The separate Core #39 durable API is
> now integrated by the [caller-driven Web lifecycle](DURABLE_SCENE_RUNS_WEB.md).
> The legacy route below remains unused; its lack of receipt evidence is unchanged.

# Запуск сцен: подтверждённый предел Core #36

Проверен точный Core 6783ce0347004d101ec2ffa5eb60c48946901786, app/api/routes.py, app/services/scene_service.py и app/services/device_service.py.

POST /scenes/{id}/run существует и требует scene.run. Ответ — SceneRead (определение сцены), не receipt выполнения. SceneService.run последовательно вызывает DeviceService.update_state и публикует scene_started. При MQTT transport update_state отправляет команду и возвращает прежний DeviceRead без ожидания ACK/state. Ответ сцены не содержит run_id, command_id, correlation_id или итогов отдельных действий; событие scene_started тоже не является результатом оборудования.

При ошибке на позднем действии ранние команды уже могли уйти. В endpoint нет подтверждённого idempotency-контракта для безопасного повторного запуска. DeviceRead также не даёт надёжной классификации software/physical, поэтому Web не может сам обещать software-only для произвольного дома. Физический серверный guard сохраняется.

В этой UI-части POST не вызывается. Нельзя подписать ответ 200 как «выполнено», считать совпадение состояния подтверждением конкретного запуска или автоматически повторять после ошибки. Для полноценного результата нужен Core execution/receipt contract с per-action correlation и терминальными исходами; альтернативный ограниченный UX мог бы честно показывать только факт запроса и неизвестный результат, но это не выполнение сцены и не реализуется под видом завершённой функции. Последующий этап должен согласовать контракт и проверить partial failure/idempotency в software-only fixture. Сохранение описаний сцен и существующая демо-симуляция сохранены.


## Core #37 follow-up

Live verification now pins `a2bc83aa2451590f71ac34f9aad1c7c328bccb19` (Core #37, based on #36). It preflights all scene actions before dispatch and rechecks the physical guard during updates. This does not provide a scene run receipt, per-action confirmation IDs, or safe idempotent retry. Web therefore preserves its explicit read/create/rename boundary; the mock scene button reports simulation only. Accepted scene dispatch must not be labelled confirmed completion. The #36 launcher still pins Web `fac23c233a1c86dad1661a9e2970cfca9450d00d`; this new UI is tested by the isolated live runner, not claimed compatible with that launcher's strict pin.
