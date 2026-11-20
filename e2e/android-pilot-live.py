"""Real Android + pinned Core + browser smoke; requires an isolated emulator and fixture APK."""
import asyncio
import base64
import contextlib
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
import threading
import time
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

import aiomqtt
from playwright.async_api import async_playwright, expect

WEB = Path(__file__).resolve().parents[1]
CORE = Path(os.environ['KZ_PILOT_CORE']).resolve()
CERT = Path(os.environ['KZ_PILOT_EMULATOR_CERT']).resolve()
OUT = Path(os.environ['KZ_PILOT_EVIDENCE']).resolve()
PACKAGE = 'kz.kzhome.pilot'
ORIGIN = 'https://10.0.2.2:8443'
sys.path[:0] = [str(CORE), str(CORE / 'tests')]
from confirmed_live_stack import stack, provision  # noqa: E402
from simulator.mqtt_relay import Relay  # noqa: E402
from app.transports.mqtt_topics import TopicKind  # noqa: E402
from app.transports.mqtt_models import CommandEnvelope  # noqa: E402


def adb(*args, binary=False):
    return subprocess.check_output(['adb', *args], stderr=subprocess.DEVNULL,
                                   text=not binary, timeout=20)


def node(selector, timeout=25, field=None):
    end = time.monotonic() + timeout
    last_structure = []
    labels = {'core-address': 'Адрес Core', 'login-email': 'Электронная почта', 'login-password': 'Пароль'}
    while time.monotonic() < end:
        try:
            remote = '/data/local/tmp/kz-view.xml'
            adb('shell', 'uiautomator', 'dump', remote)
            data = adb('shell', 'cat', remote)
            adb('shell', 'rm', remote)
            elements = [element.attrib for element in ET.fromstring(data).iter('node')]
            last_structure = [{name: item.get(name, '') for name in ('class','resource-id','package','bounds','password')}
                              for item in elements]
            def center(item):
                numbers = [int(n) for n in re.findall(r'\d+', item['bounds'])]
                if len(numbers) == 4 and numbers[2] > numbers[0] and numbers[3] > numbers[1]:
                    return ((numbers[0] + numbers[2]) // 2, (numbers[1] + numbers[3]) // 2)
                return None

            for item in elements:
                if item.get('package') != PACKAGE or field is not None and not item.get('class','').endswith('EditText'):
                    continue
                description = item.get('content-desc', '')
                resource = item.get('resource-id', '').rsplit('/',1)[-1]
                matches = selector in (item.get('text'), description, resource)
                if field is not None:
                    label = labels[selector]
                    matches = matches or any((value or '').startswith(label) for value in (description, item.get('text')))
                result = center(item)
                if matches and result:
                    return result
            # Some WebView versions omit DOM IDs and label the form but not
            # individual nodes. Only choose in a known, separately checked app screen.
            if field is not None:
                edits = [item for item in elements if item.get('package') == PACKAGE
                         and item.get('class','').endswith('EditText') and center(item)]
                if field == 'address' and len(edits) == 1:
                    return center(edits[0])
                if field in ('email','password') and len(edits) == 2:
                    wanted = [item for item in edits if (item.get('password') == 'true') == (field == 'password')]
                    if len(wanted) == 1:
                        return center(wanted[0])
        except (subprocess.SubprocessError, ET.ParseError):
            pass
        time.sleep(.2)
    # Do not store raw XML: it may contain typed inputs. This file is shape only.
    (OUT/'ui-failure-shape.json').write_text(json.dumps(last_structure, indent=2))
    raise AssertionError(f'Visible Android UI element not found: {selector}')


def tap(selector):
    x, y = node(selector)
    adb('shell', 'input', 'tap', str(x), str(y))


def enter(selector, text):
    field = {'core-address':'address', 'login-email':'email', 'login-password':'password'}[selector]
    x, y = node(selector, field=field)
    adb('shell', 'input', 'tap', str(x), str(y))
    # All inputs here are synthetic and contain only shell-safe characters.
    if not re.fullmatch(r'[A-Za-z0-9_@.:/\-]+', text):
        raise AssertionError('Unexpected emulator fixture input')
    adb('shell', 'input', 'text', text)


def screenshot(name):
    (OUT / name).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))


@contextlib.contextmanager
def tls_proxy(baseurl):
    upstream = urlsplit(baseurl)
    mutations = []
    class Proxy(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass
        def forward(self):
            # Owned loopback fixture. Never capture auth headers, tokens or request bodies.
            incoming = int(self.headers.get('Content-Length', '0'))
            if not self.path.startswith('/') or self.path.startswith('//') or incoming > 1_000_000:
                self.send_error(400)
                return
            if self.command not in ('GET', 'HEAD'):
                mutations.append((self.command, urlsplit(self.path).path))
            connection = http.client.HTTPConnection(upstream.hostname, upstream.port, timeout=12)
            try:
                connection.request(self.command, self.path, self.rfile.read(incoming) if incoming else None,
                    {h: self.headers[h] for h in ('Authorization', 'Content-Type', 'Idempotency-Key', 'Accept')
                     if h in self.headers})
                response = connection.getresponse()
                data = response.read()
                self.send_response(response.status)
                for name in ('Content-Type', 'Retry-After'):
                    if response.getheader(name):
                        self.send_header(name, response.getheader(name))
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            finally:
                connection.close()
        do_GET = do_POST = do_PUT = do_PATCH = do_DELETE = forward
    server = ThreadingHTTPServer(('127.0.0.1', 8443), Proxy)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(CERT / 'leaf.pem', CERT / 'leaf.key')
    server.socket = context.wrap_socket(server.socket, server_side=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield mutations
    finally:
        server.shutdown()
        server.server_close()


async def wait_value(api, wanted):
    for _ in range(70):
        item = await api.request('GET', '/devices/fixture_relay')
        if item['online'] and item['state'].get('on') is wanted:
            return
        await asyncio.sleep(.2)
    raise AssertionError('Core did not confirm expected relay state')


async def acceptance(values):
    config, seed, ids, api, sql, schema = values
    assert schema == '0018_scene_drafts'
    await provision(api, ids, seed)
    await api.request('POST', '/scenes', {
        'id': 'run_away', 'house_id': 'fixture_house', 'name': 'Ушёл из дома',
        'actions': [{'type': 'device_state', 'device_id': 'fixture_relay', 'state': {'on': False}}],
    })
    received = []
    async with aiomqtt.Client(hostname=config.host, port=config.port, username=config.username,
                             password=config.password, identifier=config.client_id,
                             tls_context=ssl.create_default_context(cafile=config.ca_file)) as mqtt:
        async def publish(topic, payload, **options):
            await mqtt.publish(topic, payload, **options)
        relay = Relay(config.house_id, config.device_id, publish)
        await mqtt.subscribe(relay.topic(TopicKind.SET), qos=1)
        async def receive():
            async for item in mqtt.messages:
                envelope = CommandEnvelope.model_validate_json(bytes(item.payload))
                assert not item.retain
                received.append(envelope.command_id)
                await relay.handle(str(item.topic), bytes(item.payload), item.retain)
        task = asyncio.create_task(receive())
        await relay.send(TopicKind.STATUS, relay.status(True))
        await relay.state('initial-state')
        await wait_value(api, False)
        vite = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', '4178', '--strictPort'],
            cwd=WEB, env={**os.environ, 'VITE_DATA_MODE': 'core', 'VITE_API_URL': '/core-api',
                          'CORE_DEV_PROXY_TARGET': api.base}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            with tls_proxy(api.base) as mutations, contextlib.ExitStack() as recorder_cleanup:
                async with async_playwright() as playwright:
                    browser = await playwright.chromium.launch(channel='chrome', chromium_sandbox=True)
                    page = await browser.new_page(viewport={'width': 1060, 'height': 800})
                    for _ in range(50):
                        try:
                            await page.goto('http://127.0.0.1:4178', timeout=2000)
                            break
                        except Exception:
                            await asyncio.sleep(.2)
                    else:
                        raise AssertionError('Desktop Web did not start')
                    await page.get_by_label('Электронная почта').fill('owner@example.test')
                    await page.get_by_label('Пароль', exact=True).fill(seed['password'])
                    await page.get_by_role('button', name='Войти', exact=True).click()
                    await page.get_by_role('link', name='Устройства', exact=True).click()
                    card = page.get_by_role('article', name='Software relay · Room')
                    await expect(card.get_by_text('Выключено', exact=True)).to_be_visible()

                    await asyncio.to_thread(adb, 'install', '-r', os.environ['KZ_PILOT_FIXTURE_APK'])
                    await asyncio.to_thread(adb, 'shell', 'svc', 'wifi', 'enable')
                    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-n', f'{PACKAGE}/.MainActivity')
                    try:
                        await asyncio.to_thread(node, 'Подключить дом')
                        await asyncio.to_thread(screenshot, 'android-first-use.png')
                        await asyncio.to_thread(enter, 'core-address', ORIGIN)
                    except AssertionError:
                        # Still before any password or token was entered.
                        await asyncio.to_thread(screenshot, 'android-first-use-failure.png')
                        raise
                    await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '4')  # close keyboard
                    await asyncio.to_thread(tap, 'Продолжить')
                    await asyncio.to_thread(node, 'Вход в дом')
                    await asyncio.to_thread(enter, 'login-email', 'owner@example.test')
                    await asyncio.to_thread(enter, 'login-password', seed['password'])
                    await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '4')
                    await asyncio.to_thread(tap, 'Войти')
                    await asyncio.to_thread(tap, 'Комнаты')
                    await asyncio.to_thread(tap, 'Room')
                    recorder = subprocess.Popen(['adb','shell','screenrecord','--time-limit','90',
                        '/data/local/tmp/kz-pilot.mp4'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    recorder_cleanup.callback(lambda: recorder.terminate() if recorder.poll() is None else None)
                    await asyncio.to_thread(tap, 'Включить')
                    await wait_value(api, True)
                    await asyncio.to_thread(node, 'Включено')
                    await page.reload()
                    await page.get_by_label('Электронная почта').fill('owner@example.test')
                    await page.get_by_label('Пароль', exact=True).fill(seed['password'])
                    await page.get_by_role('button', name='Войти', exact=True).click()
                    await expect(card.get_by_text('Включено', exact=True)).to_be_visible()
                    await page.screenshot(path=OUT/'desktop-same-ack.png')
                    await asyncio.to_thread(screenshot, 'android-ack.png')
                    if recorder.poll() is None:
                        await asyncio.to_thread(adb, 'shell', 'pkill', '-INT', 'screenrecord')
                    await asyncio.to_thread(recorder.wait, 10)
                    await asyncio.to_thread(adb, 'pull', '/data/local/tmp/kz-pilot.mp4', str(OUT/'android-same-home.mp4'))
                    await asyncio.to_thread(tap, 'Добавить в избранное: Software relay')
                    await asyncio.to_thread(node, 'Убрать из избранного: Software relay')
                    await page.get_by_role('link', name='Главная', exact=True).click()
                    await page.get_by_role('button', name='Обновить данные').click()
                    await expect(page.get_by_role('button', name='Убрать из избранного: Software relay')).to_be_visible()
                    await asyncio.to_thread(tap, 'Выключить')
                    await wait_value(api, False)
                    await asyncio.to_thread(tap, 'Сценарии')
                    await asyncio.to_thread(tap, 'Запуск и результат')
                    await asyncio.to_thread(tap, 'Запустить сценарий')
                    await asyncio.to_thread(node, 'Все действия подтверждены')
                    await asyncio.to_thread(screenshot, 'android-scene.png')
                    await asyncio.to_thread(tap, 'Ещё')
                    await asyncio.to_thread(tap, 'Журнал')
                    await asyncio.to_thread(node, 'Журнал событий')
                    await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '4')
                    await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '3')
                    await asyncio.to_thread(adb, 'shell', 'svc', 'wifi', 'disable')
                    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-n', f'{PACKAGE}/.MainActivity')
                    await asyncio.to_thread(node, 'Нет связи с домом. Подключитесь к домашнему Wi‑Fi.')
                    command_count = len(received)
                    await asyncio.to_thread(adb, 'shell', 'svc', 'wifi', 'enable')
                    await asyncio.sleep(3)
                    assert len(received) == command_count == 3
                    assert len(set(received)) == 3
                    assert sql("SELECT count(*) FROM device_commands WHERE ack_received_at IS NOT NULL AND state_received_at IS NOT NULL") == '3'
                    await asyncio.to_thread(adb, 'shell', 'am', 'force-stop', PACKAGE)
                    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-n', f'{PACKAGE}/.MainActivity')
                    await asyncio.to_thread(node, 'Комнаты')
                    assert ('POST', '/auth/refresh') in mutations
                    vault = ET.fromstring(await asyncio.to_thread(adb, 'exec-out','run-as',PACKAGE,
                                            'cat','shared_prefs/kzhome.vault.v1.xml'))
                    for key in ('refresh','home'):
                        data = base64.b64decode(vault.find(f"./string[@name='{key}']").text, validate=True)
                        assert data[0] == 1 and len(data) > 29
                    await browser.close()
                    (OUT/'report.json').write_text(json.dumps({
                        'core': os.environ['KZ_PILOT_CORE_SHA'],
                        'web': subprocess.check_output(['git','rev-parse','HEAD'], cwd=WEB, text=True).strip(),
                        'apk_kind': 'separately built test fixture CA overlay; not for owner delivery',
                        'schema': schema, 'mqtt_commands': 3, 'ack_and_state': 3,
                        'desktop_same_state_and_favorite': True, 'native_scene_confirmed': True, 'native_journal_opened': True,
                        'wifi_reconnect_no_additional_command': True, 'native_refresh_after_process_restart': True,
                    }, indent=2))
        finally:
            vite.terminate()
            vite.wait(timeout=15)
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    assert subprocess.check_output(['git','rev-parse','HEAD'], cwd=CORE, text=True).strip() == os.environ['KZ_PILOT_CORE_SHA']
    async with stack(CORE) as values:
        await acceptance(values)


if __name__ == '__main__':
    asyncio.run(main())
