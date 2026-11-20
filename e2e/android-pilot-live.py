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


def fixture_network_state():
    state = adb('shell','cmd','wifi','status')
    associated = bool(re.search(r'connected to.*AndroidWifi', state, re.IGNORECASE))
    connectivity = adb('shell','dumpsys','connectivity')
    active = re.search(r'^Active default network:\s*(\d+)\s*$', connectivity, re.MULTILINE)
    default_wifi = bool(active and re.search(
        rf'NetworkAgentInfo.*network\{{{active[1]}\}}[^\n]*Transports: WIFI\b', connectivity))
    return associated, bool(active), default_wifi


def wait_fixture_offline(name):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        associated, default_present, default_wifi = fixture_network_state()
        if not associated and not default_present and not default_wifi:
            (OUT / name).write_text('AndroidWifi associated=false; active default present=false; Wi-Fi=false\n')
            return
        time.sleep(1)
    (OUT / name).write_text(f'AndroidWifi associated={associated}; active default present={default_present}; Wi-Fi={default_wifi}\n')
    raise AssertionError('Android OS did not transition to no active default network')


def connect_fixture_wifi():
    # Synthetic emulator network only. Prevent cellular from being the default.
    adb('shell','svc','data','disable')
    adb('shell','svc','wifi','enable')
    time.sleep(1)
    adb('shell','cmd','wifi','connect-network','AndroidWifi','open')
    deadline = time.monotonic()+45
    associated = default_wifi = False
    while time.monotonic()<deadline:
        associated, default_present, default_wifi = fixture_network_state()
        if associated and default_wifi:
            return
        time.sleep(1)
    (OUT/'fixture-wifi-status.txt').write_text(
        f'AndroidWifi associated={associated}; active default present={default_present}; active is Wi-Fi={default_wifi}\n')
    raise AssertionError('Emulator did not establish a current AndroidWifi default network')


def screenshot(name):
    (OUT / name).write_bytes(adb('exec-out', 'screencap', '-p', binary=True))


async def offline_banner(page, name):
    # Android WebView omits this visually rendered aria-live region from
    # UIAutomator. Decode *native screenshot bytes* with the fixture browser,
    # never use its DOM as a substitute for the Android display.
    pattern = '''
      async image => {
        const bmp = await createImageBitmap(await (await fetch(image)).blob());
        if (bmp.width !== 320 || bmp.height !== 640) return false;
        const canvas = new OffscreenCanvas(bmp.width, bmp.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bmp, 0, 0);
        const { data } = ctx.getImageData(0, 0, 320, 110);
        const color = (x,y) => data.subarray(4*(320*y+x), 4*(320*y+x)+3);
        const background = (x,y) => color(x,y).every((v,i) => Math.abs(v-[248,241,229][i]) <= 4);
        const ink = (x,y) => {
          const [r,g,b] = color(x,y);
          return r < 188 && g < 148 && b < 108 && r-g > 33 && r-g < 52;
        };
        // Reference horizontal ink profiles of both Cyrillic lines from
        // the reviewed 8cfad37 offline PNG. Tolerate rasterization drift.
        const reference = [
          [14,22,14,11,13,25,14,15,13,7,6,24,20,7,10,13,18,10,16,13,16,24,13,22,13,5,21,14,21,13,10,4,4,0,0,0],
          [12,20,20,18,17,22,12,22,19,14,11,14,14,12,19,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        ];
        return [-3,-2,-1,0,1,2,3].some(dy => {
          let backgroundCount = 0;
          for (let y=27+dy; y<92+dy; y++) for (const x of [3,10,309,316]) backgroundCount += background(x,y);
          if (backgroundCount < 230) return false;
          return [[40,56],[63,81]].every(([top,bottom],i) => {
            const measured = Array.from({length:36},(_,j) => {
              let count = 0;
              for (let x=16+8*j;x<24+8*j;x++) for (let y=top+dy;y<bottom+dy;y++) count += ink(x,y);
              return count;
            });
            const error = measured.reduce((sum,n,j) => sum+Math.abs(n-reference[i][j]),0);
            const inkTotal = reference[i].reduce((sum,n) => sum+n,0);
            return error < .27*inkTotal;
          });
        });
      }
    '''
    for _ in range(16):
        raw = await asyncio.to_thread(adb, 'exec-out', 'screencap', '-p', binary=True)
        (OUT / name).write_bytes(raw)
        data_url = 'data:image/png;base64,' + base64.b64encode(raw).decode('ascii')
        if await page.evaluate(pattern, data_url):
            return
        await asyncio.sleep(.5)
    raise AssertionError('Expected two-line offline alert was not visible in native Android screenshots')


@contextlib.contextmanager
def tls_proxy(baseurl):
    upstream = urlsplit(baseurl)
    mutations = []
    health_events = []
    authenticated_reads = []
    restore_faults = {'health_unavailable': False, 'drop_refresh_response': False}
    withheld_refresh_statuses = []
    anonymous_health_violation = []
    class Proxy(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass
        def forward(self):
            # Owned loopback fixture. Never capture auth headers, tokens or request bodies.
            incoming = int(self.headers.get('Content-Length', '0'))
            if not self.path.startswith('/') or self.path.startswith('//') or incoming > 1_000_000:
                self.send_error(400)
                return
            path = urlsplit(self.path).path
            if self.command not in ('GET', 'HEAD'):
                mutations.append((self.command, path))
            if self.command == 'GET' and path == '/health':
                if incoming or 'Authorization' in self.headers or 'Cookie' in self.headers:
                    anonymous_health_violation.append(True)
                if restore_faults['health_unavailable']:
                    # Only the disposable loopback TLS proxy simulates unavailable Core.
                    self.send_error(503)
                    self.wfile.flush()
                    health_events.append(503)
                    return
            connection = http.client.HTTPConnection(upstream.hostname, upstream.port, timeout=12)
            try:
                connection.request(self.command, self.path, self.rfile.read(incoming) if incoming else None,
                    {h: self.headers[h] for h in ('Authorization', 'Content-Type', 'Idempotency-Key', 'Accept')
                     if h in self.headers})
                response = connection.getresponse()
                if self.command == 'GET' and path == '/health':
                    health_events.append(response.status)
                elif self.command == 'GET' and path in ('/auth/me', '/houses'):
                    authenticated_reads.append((path, response.status))
                data = response.read()
                if self.command == 'POST' and path == '/auth/refresh' and restore_faults['drop_refresh_response']:
                    # Core has already handled the actual POST. Do not send any
                    # status/header/body to the APK, including rotated credentials.
                    withheld_refresh_statuses.append(response.status)
                    self.close_connection = True
                    return
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
        yield mutations, health_events, authenticated_reads, restore_faults, withheld_refresh_statuses, anonymous_health_violation
    finally:
        server.shutdown()
        server.server_close()


async def wait_for_evidence(predicate, description, seconds=18):
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        if predicate():
            return
        await asyncio.sleep(.1)
    raise AssertionError(description)


async def fixture_vault():
    # Ciphertext remains in memory; do not print it or persist it as evidence.
    raw = await asyncio.to_thread(adb, 'exec-out', 'run-as', PACKAGE, 'cat', 'shared_prefs/kzhome.vault.v1.xml')
    return ET.fromstring(raw)


def has_validated_fixture_wifi():
    associated, default_present, default_wifi = fixture_network_state()
    if not (associated and default_present and default_wifi):
        return False
    connectivity = adb('shell', 'dumpsys', 'connectivity')
    active = re.search(r'^Active default network:\s*(\d+)\s*$', connectivity, re.MULTILINE)
    return bool(active and re.search(
        rf'NetworkAgentInfo.*network\{{{active[1]}\}}[^\n]*Transports: WIFI[^\n]*(?<![A-Z_])VALIDATED\b',
        connectivity))


async def verify_cold_restore(mutations, health_events, authenticated_reads, faults, withheld, violations):
    def refresh_count():
        return mutations.count(('POST', '/auth/refresh'))

    refresh_before = refresh_count()
    health_before = len(health_events)
    vault = await fixture_vault()
    original_ciphertext = vault.findtext("./string[@name='refresh']")
    assert original_ciphertext
    assert await asyncio.to_thread(has_validated_fixture_wifi), 'Current default is not validated synthetic Wi-Fi'
    faults['health_unavailable'] = True
    await asyncio.to_thread(adb, 'shell', 'am', 'force-stop', PACKAGE)
    for attempt in range(1, 3):
        await asyncio.to_thread(adb, 'shell', 'am', 'start', '-W', '-n', f'{PACKAGE}/.MainActivity')
        await wait_for_evidence(lambda: len(health_events) >= health_before + attempt,
                                'APK did not issue anonymous health GET while proxy was unavailable')
        await asyncio.to_thread(node, 'Вход в дом')
        assert health_events[health_before:] == [503] * attempt
        assert refresh_count() == refresh_before
        assert (await fixture_vault()).findtext("./string[@name='refresh']") == original_ciphertext
        assert await asyncio.to_thread(has_validated_fixture_wifi), 'Wi-Fi changed during backend fault'
        await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '3')
    faults['health_unavailable'] = False
    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-W', '-n', f'{PACKAGE}/.MainActivity')
    await asyncio.to_thread(node, 'Комнаты')
    assert health_events[health_before:] == [503, 503, 200]
    assert refresh_count() == refresh_before + 1
    rotated = await fixture_vault()
    for key in ('refresh', 'home'):
        encoded = rotated.findtext(f"./string[@name='{key}']")
        assert encoded
        data = base64.b64decode(encoded, validate=True)
        assert data[0] == 1 and len(data) > 29
    assert rotated.findtext("./string[@name='refresh']") != original_ciphertext

    # Separate post-ambiguity case after one successful native restore.
    faults['drop_refresh_response'] = True
    reads_before_loss = len(authenticated_reads)
    await asyncio.to_thread(adb, 'shell', 'am', 'force-stop', PACKAGE)
    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-W', '-n', f'{PACKAGE}/.MainActivity')
    await wait_for_evidence(lambda: bool(withheld), 'Core did not handle a refresh before response loss')
    await asyncio.to_thread(node, 'Войти', scroll=1)
    assert withheld == [200]
    assert (await fixture_vault()).findtext("./string[@name='refresh']") is None
    assert len(authenticated_reads) == reads_before_loss
    await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '3')
    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-W', '-n', f'{PACKAGE}/.MainActivity')
    await asyncio.to_thread(node, 'Вход в дом', scroll=-1)
    assert refresh_count() == refresh_before + 2
    assert health_events[health_before:] == [503, 503, 200, 200]
    assert withheld == [200]
    assert not violations, 'A health probe carried credentials'


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
    release_second_ack = asyncio.Event()
    second_mqtt = asyncio.Event()
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
                elif len(received) == 2:
                    second_mqtt.set()
                    await asyncio.wait_for(release_second_ack.wait(), 25)
                await relay.handle(str(item.topic), bytes(item.payload), item.retain)
        task = asyncio.create_task(receive())
        await relay.send(TopicKind.STATUS, relay.status(True))
        await relay.state('initial-state')
        await wait_value(api, False)
        vite = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', '4178', '--strictPort'],
            cwd=WEB, env={**os.environ, 'VITE_DATA_MODE': 'core', 'VITE_API_URL': '/core-api',
                          'CORE_DEV_PROXY_TARGET': api.base}, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            with tls_proxy(api.base) as (
                mutations, health_events, authenticated_reads, restore_faults, withheld, health_violations
            ), contextlib.ExitStack() as recorder_cleanup:
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
                    # Normal ON: preserve verified native and desktop evidence before
                    # later interruption checks can fail independently.
                    await asyncio.wait_for(first_mqtt.wait(), 10)
                    await asyncio.to_thread(node, 'Ожидаем подтверждение', prefix=True, scroll=1)
                    assert len(received) == 1
                    await asyncio.to_thread(screenshot, 'android-pending.png')
                    release_first_ack.set()
                    await wait_value(api, True)
                    assert sql("SELECT count(*) FROM device_commands WHERE status='applied' AND ack_status='applied' "
                               "AND requested_on IS TRUE AND reported_on IS TRUE AND ack_received_at IS NOT NULL "
                               "AND state_received_at IS NOT NULL") == '1'
                    await asyncio.to_thread(node, 'Включено', scroll=-1)
                    await asyncio.to_thread(screenshot, 'android-ack.png')
                    print('Android ON: one real MQTT command; Core DB ACK and state applied; native UI ON', flush=True)
                    assert len(received) == 1
                    assert mutations.count(('POST', '/v1/devices/fixture_relay/commands')) == 1
                    await page.get_by_role('link', name='Главная', exact=True).click()
                    await page.get_by_role('button', name='Обновить данные', exact=True).click()
                    await page.get_by_role('link', name='Устройства', exact=True).click()
                    await expect(card.get_by_text('Включено', exact=True)).to_be_visible(timeout=15_000)
                    print('Phone command confirmed, desktop observed same state', flush=True)
                    await page.screenshot(path=OUT/'desktop-same-ack.png')
                    (OUT/'on-proof.json').write_text(json.dumps({
                        'core': os.environ['KZ_PILOT_CORE_SHA'],
                        'web': subprocess.check_output(['git','rev-parse','HEAD'], cwd=WEB, text=True).strip(),
                        'device': 'isolated MQTT software relay', 'native_http_posts': 1, 'mqtt_commands': 1,
                        'before': False, 'confirmed': True, 'core_ack_received': True, 'core_state_received': True,
                        'native_confirmed': True, 'desktop_confirmed': True,
                    }, indent=2))
                    if recorder.poll() is None:
                        await asyncio.to_thread(adb, 'shell', 'pkill', '-INT', 'screenrecord')
                    await asyncio.to_thread(recorder.wait, 10)
                    await asyncio.to_thread(adb, 'pull', '/data/local/tmp/kz-pilot.mp4', str(OUT/'android-same-home.mp4'))
                    await asyncio.to_thread(tap, 'Добавить в избранное: Software relay', scroll=-1)
                    await asyncio.to_thread(node, 'Убрать из избранного: Software relay')
                    await page.get_by_role('link', name='Главная', exact=True).click()
                    await page.get_by_role('button', name='Обновить данные').click()
                    await expect(page.get_by_role('button', name='Убрать из избранного: Software relay')).to_be_visible()
                    # OFF uses a separate interrupted flow; no extra request may
                    # be generated when Wi-Fi returns.
                    await asyncio.to_thread(tap, 'Выключить', scroll=1)
                    await asyncio.wait_for(second_mqtt.wait(), 10)
                    await asyncio.to_thread(node, 'Ожидаем подтверждение', prefix=True, scroll=1)
                    await asyncio.to_thread(adb, 'shell', 'input', 'keyevent', '3')
                    await asyncio.to_thread(adb, 'shell', 'svc', 'wifi', 'disable')
                    try:
                        await asyncio.to_thread(wait_fixture_offline, 'android-interruption-network.txt')
                    finally:
                        release_second_ack.set()
                    await wait_value(api, False)
                    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-n', f'{PACKAGE}/.MainActivity')
                    await offline_banner(page, 'android-interruption-offline.png')
                    await asyncio.to_thread(connect_fixture_wifi)
                    await asyncio.to_thread(node, 'Выключено', scroll=-1)
                    assert len(received) == 2
                    assert mutations.count(('POST', '/v1/devices/fixture_relay/commands')) == 2
                    print('Android OFF while backgrounded and Wi-Fi disabled: state recovered, no second POST', flush=True)
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
                    await asyncio.to_thread(wait_fixture_offline, 'android-journal-offline-network.txt')
                    await asyncio.to_thread(adb, 'shell', 'am', 'start', '-n', f'{PACKAGE}/.MainActivity')
                    await offline_banner(page, 'android-journal-offline.png')
                    command_count = len(received)
                    await asyncio.to_thread(connect_fixture_wifi)
                    await asyncio.sleep(3)
                    assert len(received) == command_count == 3
                    assert len(set(received)) == 3
                    assert mutations.count(('POST', '/v1/devices/fixture_relay/commands')) == 2
                    assert mutations.count(('POST', '/v1/houses/fixture_house/scene-runs/execute')) == 1
                    assert sql("SELECT count(*) FROM device_commands WHERE ack_received_at IS NOT NULL AND state_received_at IS NOT NULL") == '3'
                    await verify_cold_restore(mutations, health_events, authenticated_reads,
                                              restore_faults, withheld, health_violations)
                    print('Native cold start: [503, 503] preserved ciphertext; one recovery refresh; '
                          'one lost Core-accepted response was not retried', flush=True)
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
                        'cold_start_unavailable_health_statuses': [503, 503],
                        'no_vault_consumption_before_successful_health': True,
                        'recovery_refresh_posts': 1, 'ambiguous_refresh_posts': 1,
                        'no_refresh_retry_after_ambiguous_response': True,
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
