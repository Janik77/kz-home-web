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


def node(selector, timeout=25, field=None, stable=False, prefix=False, scroll=0, for_tap=False):
    end = time.monotonic() + timeout
    last_structure = []
    previous_center = None
    misses = swipes = 0
    labels = {'core-address': 'Адрес Core', 'login-email': 'Электронная почта', 'login-password': 'Пароль'}
    while time.monotonic() < end:
        try:
            remote = '/data/local/tmp/kz-view.xml'
            adb('shell', 'uiautomator', 'dump', remote)
            data = adb('shell', 'cat', remote)
            adb('shell', 'rm', remote)
            elements = [element.attrib for element in ET.fromstring(data).iter('node')]
            last_structure = [{name: item.get(name, '') for name in ('class','resource-id','package','bounds','password','enabled','clickable')}
                              for item in elements]
            def center(item):
                numbers = [int(n) for n in re.findall(r'\d+', item['bounds'])]
                if len(numbers) == 4 and numbers[2] > numbers[0] and numbers[3] > numbers[1]:
                    return ((numbers[0] + numbers[2]) // 2, (numbers[1] + numbers[3]) // 2)
                return None

            if not elements:
                continue
            screen = [int(n) for n in re.findall(r'\d+', elements[0]['bounds'])]
            if len(screen) != 4:
                continue
            width, height = screen[-2:]
            candidates = []
            for item in elements:
                if item.get('package') != PACKAGE or field is not None and not item.get('class','').endswith('EditText'):
                    continue
                description = item.get('content-desc', '')
                resource = item.get('resource-id', '').rsplit('/',1)[-1]
                accessible = (item.get('text', ''), description)
                matches = selector in (*accessible, resource) or prefix and any(value.startswith((selector + ' ', selector + '.', selector + ':')) for value in accessible)
                if field is not None:
                    label = labels[selector]
                    matches = matches or any((value or '').startswith(label) for value in (description, item.get('text')))
                result = center(item)
                if (matches and result and (not for_tap or item.get('enabled') != 'false')
                        and (not scroll or result[1] <= height - 120)):
                    candidates.append((item.get('clickable') == 'true', result))
            if candidates:
                result = max(candidates, key=lambda item: item[0])[1]
                if not stable or result == previous_center:
                    return result
                previous_center = result
            else:
                previous_center = None
                misses += 1
                if scroll and misses % 2 == 0 and swipes < 4:
                    # Use a real content gesture, leaving the fixed bottom navigation alone.
                    x, y1, y2 = int(width*.72), int(height*.73), int(height*.40)
                    if scroll < 0:
                        y1, y2 = y2, y1
                    adb('shell', 'input', 'swipe', str(x), str(y1), str(x), str(y2), '350')
                    swipes += 1
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


def tap(selector, stable=False, prefix=False, scroll=0):
    x, y = node(selector, stable=stable, prefix=prefix, scroll=scroll, for_tap=True)
    adb('shell', 'input', 'tap', str(x), str(y))


def enter(selector, text):
    field = {'core-address':'address', 'login-email':'email', 'login-password':'password'}[selector]
    x, y = node(selector, field=field)
    adb('shell', 'input', 'tap', str(x), str(y))
    # All inputs here are synthetic and contain only shell-safe characters.
    if not re.fullmatch(r'[A-Za-z0-9_@.:/\-]+', text):
        raise AssertionError('Unexpected emulator fixture input')
    adb('shell', 'input', 'text', text)


def close_ime():
    adb('shell', 'input', 'keyevent', '4')
    # Wait through the OS IME settle animation. The next tap also requires the
    # same visible button center over two actual accessibility dumps.
    time.sleep(.8)


def connect_fixture_wifi():
    # Synthetic emulator network only. Prevent cellular from being the default.
    adb('shell','svc','data','disable')
    adb('shell','svc','wifi','enable')
    time.sleep(1)
    adb('shell','cmd','wifi','connect-network','AndroidWifi','open')
    deadline = time.monotonic()+45
    associated = default_wifi = False
    while time.monotonic()<deadline:
        state = adb('shell','cmd','wifi','status')
        associated = bool(re.search(r'connected to.*AndroidWifi', state, re.IGNORECASE))
        connectivity = adb('shell','dumpsys','connectivity')
        active = re.search(r'^Active default network:\s*(\d+)\s*$', connectivity, re.MULTILINE)
        default_wifi = bool(active and re.search(
            rf'NetworkAgentInfo.*network\{{{active[1]}\}}[^\n]*Transports: WIFI\b', connectivity))
        if associated and default_wifi:
            return
        time.sleep(1)
    (OUT/'fixture-wifi-status.txt').write_text(
        f'AndroidWifi associated={associated}; active default parsed={bool(active)}; active is Wi-Fi={default_wifi}\n')
    raise AssertionError('Emulator did not establish a current AndroidWifi default network')


def screenshot(name):
    (OUT / name).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))


@contextlib.contextmanager
def tls_proxy(baseurl):
    upstream = urlsplit(baseurl)
    mutations = []
    health_events = []
    authenticated_reads = []
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
                path = urlsplit(self.path).path
                if self.command == 'GET' and path == '/health':
                    health_events.append(response.status)
                elif self.command == 'GET' and path in ('/auth/me', '/houses'):
                    authenticated_reads.append((path, response.status))
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
        yield mutations, health_events, authenticated_reads
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
    release_first_ack = asyncio.Event()
    first_mqtt = asyncio.Event()
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
                if len(received) == 1:
                    first_mqtt.set()
                    await asyncio.wait_for(release_first_ack.wait(), 25)
                await relay.handle(str(item.topic), bytes(item.payload), item.retain)
        task = asyncio.create_task(receive())
        await relay.send(TopicKind.STATUS, relay.status(True))
        await relay.state('initial-state')
        await wait_value(api, False)
        vite = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', '4178', '--strictPort'],
            cwd=WEB, env={**os.environ, 'VITE_DATA_MODE': 'core', 'VITE_API_URL': '/core-api',
                          'CORE_DEV_PROXY_TARGET': api.base}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            with tls_proxy(api.base) as (mutations, health_events, authenticated_reads), contextlib.ExitStack() as recorder_cleanup:
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
                    await page.screenshot(path=OUT/'desktop-before.png')

                    await asyncio.to_thread(adb, 'install', '-r', os.environ['KZ_PILOT_FIXTURE_APK'])
                    await asyncio.to_thread(connect_fixture_wifi)
                    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-n', f'{PACKAGE}/.MainActivity')
                    try:
                        await asyncio.to_thread(node, 'Подключить дом')
                        await asyncio.to_thread(screenshot, 'android-first-use.png')
                        await asyncio.to_thread(enter, 'core-address', ORIGIN)
                    except AssertionError:
                        # Still before any password or token was entered.
                        await asyncio.to_thread(screenshot, 'android-first-use-failure.png')
                        raise
                    await asyncio.to_thread(close_ime)
                    for attempt in range(1, 3):
                        await asyncio.to_thread(tap, 'Продолжить', stable=True)
                        try:
                            await asyncio.to_thread(node, 'Вход в дом', timeout=21)
                            break
                        except AssertionError:
                            # Diagnostic and one explicit fixture-only GET retry before any credentials.
                            # Never retry an API mutation, TLS validation, or an answered health request.
                            await asyncio.to_thread(screenshot, f'android-prelogin-attempt-{attempt}.png')
                            print(f'Native HTTPS health response codes after attempt {attempt}: {health_events}', flush=True)
                            if health_events or attempt == 2:
                                raise
                            await asyncio.to_thread(connect_fixture_wifi)
                    assert health_events == [200], health_events
                    print('Native APK completed TLS health verification; login screen is visible', flush=True)
                    await asyncio.to_thread(enter, 'login-email', 'owner@example.test')
                    await asyncio.to_thread(close_ime)  # real system Back closes IME
                    await asyncio.to_thread(node, 'Вход в дом')
                    await asyncio.to_thread(enter, 'login-password', seed['password'])
                    await asyncio.to_thread(close_ime)
                    await asyncio.to_thread(tap, 'Войти', stable=True)
                    await asyncio.to_thread(node, 'Комнаты')
                    assert ('POST', '/auth/login') in mutations
                    assert authenticated_reads[:2] == [('/auth/me', 200), ('/houses', 200)], authenticated_reads
                    print('Native APK authenticated, received Core 200 for /auth/me and /houses, and displayed the selected home', flush=True)
                    await asyncio.to_thread(tap, 'Комнаты')
                    await asyncio.to_thread(tap, 'Room', prefix=True, scroll=1)
                    recorder = subprocess.Popen(['adb','shell','screenrecord','--time-limit','90',
                        '/data/local/tmp/kz-pilot.mp4'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    recorder_cleanup.callback(lambda: recorder.terminate() if recorder.poll() is None else None)
                    await asyncio.to_thread(tap, 'Включить', scroll=1)
                    # Hold one real software MQTT ACK until after the Android client
                    # backgrounds and loses Wi-Fi; Core keeps authoritative state.
                    await asyncio.wait_for(first_mqtt.wait(), 10)
                    await asyncio.to_thread(node, 'Ожидаем подтверждение', prefix=True, scroll=1)
                    assert len(received) == 1
                    await asyncio.to_thread(screenshot, 'android-pending.png')
                    await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '3')
                    await asyncio.to_thread(adb, 'shell', 'svc', 'wifi', 'disable')
                    release_first_ack.set()
                    await wait_value(api, True)
                    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-n', f'{PACKAGE}/.MainActivity')
                    await asyncio.to_thread(node, 'Нет связи с домом. Подключитесь к домашнему Wi‑Fi.')
                    await asyncio.to_thread(connect_fixture_wifi)
                    await asyncio.to_thread(node, 'Включено', scroll=-1)
                    assert len(received) == 1
                    assert mutations.count(('POST', '/v1/devices/fixture_relay/commands')) == 1
                    await page.get_by_role('link', name='Главная', exact=True).click()
                    await page.get_by_role('button', name='Обновить данные', exact=True).click()
                    await page.get_by_role('link', name='Устройства', exact=True).click()
                    await expect(card.get_by_text('Включено', exact=True)).to_be_visible(timeout=15_000)
                    print('Phone command confirmed, desktop observed same state', flush=True)
                    await page.screenshot(path=OUT/'desktop-same-ack.png')
                    await asyncio.to_thread(screenshot, 'android-ack.png')
                    if recorder.poll() is None:
                        await asyncio.to_thread(adb, 'shell', 'pkill', '-INT', 'screenrecord')
                    await asyncio.to_thread(recorder.wait, 10)
                    await asyncio.to_thread(adb, 'pull', '/data/local/tmp/kz-pilot.mp4', str(OUT/'android-same-home.mp4'))
                    await asyncio.to_thread(tap, 'Добавить в избранное: Software relay', scroll=-1)
                    await asyncio.to_thread(node, 'Убрать из избранного: Software relay')
                    await page.get_by_role('link', name='Главная', exact=True).click()
                    await page.get_by_role('button', name='Обновить данные').click()
                    await expect(page.get_by_role('button', name='Убрать из избранного: Software relay')).to_be_visible()
                    await asyncio.to_thread(tap, 'Выключить', scroll=1)
                    await wait_value(api, False)
                    await asyncio.to_thread(tap, 'Сценарии')
                    await asyncio.to_thread(tap, 'Запуск и результат', scroll=1)
                    await asyncio.to_thread(tap, 'Запустить сценарий', scroll=1)
                    await asyncio.to_thread(node, 'Все действия подтверждены', prefix=True, scroll=1)
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
                    await asyncio.to_thread(connect_fixture_wifi)
                    await asyncio.sleep(3)
                    assert len(received) == command_count == 3
                    assert len(set(received)) == 3
                    assert mutations.count(('POST', '/v1/devices/fixture_relay/commands')) == 2
                    assert mutations.count(('POST', '/v1/houses/fixture_house/scene-runs/execute')) == 1
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
                        'native_auth_me_and_houses_200': True, 'no_extra_native_command_posts': True,
                        'active_command_background_wifi_reconnect_without_replay': True,
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
