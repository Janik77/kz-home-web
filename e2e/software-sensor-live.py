"""Desktop-only proof for an explicitly approved simulated temperature sensor."""
import asyncio
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import ssl
import subprocess
import sys
from urllib.parse import urlsplit

import aiomqtt
from playwright.async_api import async_playwright, expect

WEB = Path(__file__).resolve().parents[1]
CORE = Path(os.environ["SENSOR_CORE_SOURCE"]).resolve()
OUT = Path(os.environ["SENSOR_EVIDENCE"]).resolve()
DEVICE = "fixture_temp"
ROOM = "fixture_room"
NAME = "Software temperature"
sys.path[:0] = [str(CORE)]
from confirmed_live_stack import provision, stack  # noqa: E402


def sha(directory):
    return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=directory, text=True).strip()


async def observe(api, temperature, newer_than=None):
    async with asyncio.timeout(12):
        while True:
            row = await api.request("GET", "/devices/" + DEVICE)
            value = row.get("numeric_observed_at", {}).get("temperature")
            if row["online"] and row["state"].get("temperature") == temperature and value:
                sample = datetime.fromisoformat(value)
                if newer_than is None or sample > newer_than:
                    return sample
            await asyncio.sleep(.2)


async def acceptance(values, restart):
    config, seed, ids, api, sql, schema = values
    assert schema == "0018_scene_drafts"
    await provision(api, ids, seed, preseed_relay=False)
    assert await api.request("GET", "/devices?house_id=fixture_house") == []
    async with aiomqtt.Client(hostname=config.host, port=config.port, username=config.username,
                              password=config.password, identifier=config.client_id + "-temperature",
                              tls_context=ssl.create_default_context(cafile=config.ca_file)) as mqtt:
        async def publish_sample(temp):
            timestamp = datetime.now(UTC).isoformat()
            prefix = "kzhome/v1/fixture_house/fixture_temp"
            await mqtt.publish(prefix + "/status", json.dumps({"status": "online", "last_seen": timestamp}), qos=1, retain=False)
            await mqtt.publish(prefix + "/state", json.dumps({"state": {"temperature": temp},
                               "timestamp": timestamp, "correlation_id": f"temperature-{temp}"}), qos=1, retain=False)

        vite = subprocess.Popen(["npm", "run", "dev", "--", "--port", "4184", "--strictPort"],
            cwd=WEB, env={**os.environ, "VITE_DATA_MODE": "core", "VITE_API_URL": "/core-api",
                          "CORE_DEV_PROXY_TARGET": api.base}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            async with async_playwright() as playwright:
                browser = await playwright.chromium.launch(channel="chrome", chromium_sandbox=True)
                page = await browser.new_page(viewport={"width": 1060, "height": 800})
                for _ in range(50):
                    assert vite.poll() is None
                    try:
                        await page.goto("http://127.0.0.1:4184", timeout=2000)
                        break
                    except Exception:
                        await asyncio.sleep(.2)
                else:
                    raise AssertionError("Disposable browser server did not start")
                await page.get_by_label("Электронная почта").fill("owner@example.test")
                await page.get_by_label("Пароль", exact=True).fill(seed["password"])
                await page.get_by_role("button", name="Войти", exact=True).click()
                await page.get_by_role("link", name="Устройства", exact=True).click()
                await page.get_by_role("button", name="Добавить устройство", exact=True).click()
                await page.get_by_label("Устройство", exact=True).select_option(DEVICE)
                await page.get_by_label("Комната", exact=True).select_option(ROOM)
                await page.get_by_label("Название", exact=True).fill(NAME)
                async with page.expect_response(lambda reply: reply.request.method == "POST" and
                    urlsplit(reply.url).path == "/core-api/v1/houses/fixture_house/software-device-candidates/fixture_temp/claim") as claim:
                    await page.get_by_role("button", name="Подтвердить привязку", exact=True).click()
                assert (await claim.value).status == 201
                row = await api.request("GET", "/devices/" + DEVICE)
                assert (row["type"], row["name"], row["room_id"], row["state"], row["online"], row["capabilities"]) == (
                    "temperature_sensor", NAME, ROOM, {}, False, ["temperature"])
                assert not row.get("numeric_observed_at", {}).get("temperature")
                await page.get_by_role("link", name="Открыть комнату", exact=True).click()
                await expect(page.get_by_role("heading", name="Room", exact=True)).to_be_visible()
                card = page.get_by_role("article", name=NAME + " · Room")
                await expect(card.get_by_text("Неизвестно", exact=True)).to_be_visible()
                await expect(card.get_by_role("button", name="Включить", exact=True)).to_have_count(0)
                await expect(card.get_by_role("button", name="Выключить", exact=True)).to_have_count(0)
                await page.screenshot(path=OUT/"sensor-before.png")

                async def read_in_browser(temp):
                    # Explicit GET refresh, no queued mutation and no semantic route mocks.
                    await page.get_by_role("link", name="Главная", exact=True).click()
                    await page.get_by_role("button", name="Обновить данные", exact=True).click()
                    await page.get_by_role("link", name="Комнаты", exact=True).click()
                    await page.get_by_role("link", name="Room", exact=False).click()
                    reading = card.get_by_text(temp, exact=True)
                    await expect(reading).to_be_visible()

                await publish_sample(22.5)
                first = await observe(api, 22.5)
                await read_in_browser("22,5 °C")
                await expect(card.get_by_text("Свежее показание", exact=True)).to_be_visible()
                await page.screenshot(path=OUT/"sensor-first-sample.png")
                await restart()
                persisted = await api.request("GET", "/devices/" + DEVICE)
                assert persisted["room_id"] == ROOM and persisted["name"] == NAME
                assert persisted["state"]["temperature"] == 22.5
                assert datetime.fromisoformat(persisted["numeric_observed_at"]["temperature"]) == first
                assert {d["id"] for d in await api.request("GET", "/devices?house_id=fixture_house")} == {DEVICE}
                await read_in_browser("22,5 °C")

                await publish_sample(23.5)
                second = await observe(api, 23.5, first)
                await read_in_browser("23,5 °C")
                await expect(card.get_by_text("Свежее показание", exact=True)).to_be_visible()
                await expect(card.get_by_role("button", name="Включить", exact=True)).to_have_count(0)
                assert sql("SELECT count(*) FROM device_commands") == "0"
                await page.screenshot(path=OUT/"sensor-after-restart.png")
                (OUT/"proof.json").write_text(json.dumps({"core": sha(CORE), "web": sha(WEB),
                    "sensor": DEVICE, "selected_room": ROOM, "initial_empty_and_no_actuator": True,
                    "core_rebuilt_same_database": True, "first_sample": 22.5, "first_observed_at": first.isoformat(),
                    "sample_and_binding_survived": True, "fresh_sample": 23.5, "fresh_observed_at": second.isoformat(),
                    "browser_verified": True, "device_commands": 0}, indent=2))
        finally:
            vite.terminate()
            vite.wait(timeout=15)


async def main():
    assert sha(CORE) == os.environ["SENSOR_CORE_SHA"]
    OUT.mkdir(parents=True, exist_ok=True)
    restart = []
    async with stack(CORE, software_onboarding=True, sensor_restart=restart) as values:
        callback, = restart
        await acceptance(values, callback)


if __name__ == "__main__":
    asyncio.run(main())
