"""Owned PostgreSQL/TLS MQTT + actual Web automation acceptance; no real devices."""
import asyncio
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import sys
from uuid import uuid4

WEB = Path(__file__).resolve().parents[1]
CORE = Path(os.environ['LIVE_CORE_SOURCE']).resolve()
sys.dont_write_bytecode = True
sys.path[:0] = [str(CORE), str(CORE / 'tests')]
import aiomqtt
import httpx
from app.transports.mqtt_models import AckEnvelope, CommandEnvelope, StateEnvelope
from app.transports.mqtt_topics import TopicKind
from simulator.mqtt_relay import Relay, utc_now
from confirmed_live_stack import provision, stack
from automation_live_evidence import verify


def sha(path):
    return subprocess.check_output(['git', '-C', str(path), 'rev-parse', 'HEAD'], text=True).strip()


async def acceptance(values):
    config, seed, ids, api, sql, migration = values
    await provision(api, ids, seed)
    metadata_mode = os.environ.get('LIVE_METADATA_ONLY') == '1'
    durable_mode = os.environ.get('LIVE_DURABLE_ONLY') == '1'
    numeric_mode = os.environ.get('LIVE_NUMERIC_ONLY') == '1'
    schedule_mode = os.environ.get('LIVE_SCHEDULE_ONLY') == '1'
    if numeric_mode:
        current_device = await api.request('GET', '/devices/fixture_relay')
        await api.request('PATCH', '/devices/fixture_relay', {'capabilities': ['on_off', 'temperature', 'humidity', 'illuminance'], **({'expected_metadata_revision': current_device['metadata_revision']} if 'metadata_revision' in current_device else {})})
    received, published, triggers = [], [], []
    mode = 'apply'
    key = secrets.token_urlsafe(32)
    async with aiomqtt.Client(hostname=config.host, port=config.port, username=config.username,
                             password=config.password, identifier=config.client_id,
                             tls_context=ssl.create_default_context(cafile=config.ca_file)) as mqtt:
        async def publish(topic, payload, **policy):
            if str(topic).endswith(('/ack', '/state')):
                published.append({'topic': str(topic), 'payload': json.loads(payload), **policy})
            await mqtt.publish(topic, payload, **policy)
        relay = Relay(config.house_id, config.device_id, publish)
        await mqtt.subscribe(relay.topic(TopicKind.SET), qos=1)
        await relay.send(TopicKind.STATUS, relay.status(True))
        await relay.state('initial-state')

        async def receive():
            async for item in mqtt.messages:
                command = CommandEnvelope.model_validate_json(bytes(item.payload))
                received.append({'command_id': command.command_id, 'correlation_id': command.correlation_id,
                                 'on': command.state['on'], 'topic': str(item.topic), 'qos': item.qos, 'retain': item.retain})
                if mode == 'apply':
                    await relay.handle(str(item.topic), bytes(item.payload), item.retain)
                elif mode == 'fail':
                    await relay.send(TopicKind.ACK, AckEnvelope(command_id=command.command_id,
                        correlation_id=command.correlation_id, timestamp=utc_now(), status='failed'))
                # drop deliberately leaves a real sent command without an ACK/state.

        def evidence():
            commands = json.loads(sql("SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT command_id,correlation_id,status,requested_on,reported_on,ack_status,state_received_at,ack_received_at FROM device_commands ORDER BY created_at) t"))
            return {'received': received, 'published': published, 'triggers': triggers,
                    'commands': commands, 'migration': migration,
                    'physical_devices': sql('SELECT count(*) FROM physical_devices'),
                    'core_sha': sha(CORE), 'web_sha': sha(WEB)}

        async def control(reader, writer):
            nonlocal mode
            try:
                raw = (await asyncio.wait_for(reader.readuntil(b'\r\n\r\n'), 5)).decode('ascii').split('\r\n')
                method, path, _ = raw[0].split()
                headers = {k.lower(): v.strip() for k, v in (line.split(':', 1) for line in raw[1:] if ':' in line)}
                assert method == 'POST' and headers.get('authorization') == 'Bearer ' + key
                size = int(headers.get('content-length', '0'))
                assert 0 <= size <= 1024
                data = json.loads(await reader.readexactly(size))
                result = {}
                if path == '/numeric':
                    assert numeric_mode and data['field'] in ('temperature', 'humidity', 'illuminance')
                    from datetime import datetime, timedelta, timezone
                    timestamp = utc_now() if not data.get('stale') else datetime.now(timezone.utc) - timedelta(seconds=180)
                    frame = StateEnvelope(timestamp=timestamp, correlation_id='numeric-' + uuid4().hex, state={'on': relay.on, data['field']: data['value']})
                    triggers.append(frame.model_dump(mode='json'))
                    await mqtt.publish(relay.topic(TopicKind.STATE), frame.model_dump_json(), qos=1, retain=False)
                    result = {'correlation_id': frame.correlation_id}
                elif path == '/refresh':
                    assert schedule_mode
                    # Freshness reports are source observations, not command receipts.
                    frame = StateEnvelope(timestamp=utc_now(), correlation_id='schedule-fresh-' + uuid4().hex, state={'on': relay.on})
                    triggers.append(frame.model_dump(mode='json'))
                    await mqtt.publish(relay.topic(TopicKind.STATE), frame.model_dump_json(), qos=1, retain=True)
                elif path == '/state':
                    assert type(data['on']) is bool
                    relay.on = data['on']
                    frame = StateEnvelope(timestamp=utc_now(), correlation_id='trigger-' + uuid4().hex, state={'on': relay.on})
                    triggers.append(frame.model_dump(mode='json'))
                    await mqtt.publish(relay.topic(TopicKind.STATE), frame.model_dump_json(), qos=1, retain=True)
                    result = {'correlation_id': frame.correlation_id}
                elif path == '/repeat':
                    assert triggers
                    await mqtt.publish(relay.topic(TopicKind.STATE), json.dumps(triggers[-1]), qos=1, retain=not numeric_mode)
                elif path == '/mode':
                    assert data['mode'] in ('apply', 'fail', 'drop')
                    mode = data['mode']
                elif path == '/evidence':
                    result = await asyncio.to_thread(evidence)
                elif path == '/device':
                    result = await api.request('GET', '/devices/fixture_relay')
                elif path == '/definitions':
                    result = {'rules': await api.request('GET', '/automations')}
                elif path == '/rights':
                    rules = await api.request('GET', '/automations')
                    rule = next(r for r in rules if r['name'] == data['name'])
                    result = {}
                    async with httpx.AsyncClient(base_url=api.base) as client:
                        for actor in ('foreign', 'resident'):
                            login = await client.post('/auth/login', json={'email': actor + '@example.test', 'password': seed['password']})
                            login.raise_for_status()
                            auth = {'Authorization': 'Bearer ' + login.json()['access_token']}
                            response = await client.post('/automations/' + rule['id'] + '/dry-run', headers=auth)
                            assert response.status_code in (403, 404), 'Unauthorized dry-run accepted'
                            result[actor + '_dry_run'] = response.status_code
                            if actor == 'foreign':
                                history = await client.get('/automations/' + rule['id'] + '/runs', headers=auth)
                                assert history.status_code in (403, 404), 'Foreign history leaked'
                                result['foreign_history'] = history.status_code
                elif path == '/role':
                    assert data['role'] in ('resident', 'installer', 'technician')
                    await api.request('PATCH', f"/houses/fixture_house/members/{ids['resident']}", {'role': data['role']})
                else:
                    raise ValueError('Unknown owned-fixture action')
                body = json.dumps(result).encode()
                writer.write(b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: ' + str(len(body)).encode() + b'\r\n\r\n' + body)
                await writer.drain()
            except Exception as error:
                print('Fixture control failed: ' + type(error).__name__, flush=True)
                writer.write(b'HTTP/1.1 500 Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n')
                await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()

        receiver = asyncio.create_task(receive())
        server = await asyncio.start_server(control, '127.0.0.1', 0)
        try:
            env = {**os.environ, 'CONFIRMED_LIVE': '1', 'CORE_DEV_PROXY_TARGET': api.base,
                   'RELAY_CONTROL_URL': f'http://127.0.0.1:{server.sockets[0].getsockname()[1]}',
                   'RELAY_CONTROL_KEY': key, 'RELAY_OWNER_PASSWORD': seed['password']}
            result = await asyncio.to_thread(subprocess.run,
                ['npx', 'playwright', 'test', '--config', 'playwright.metadata-live.config.ts' if metadata_mode else 'playwright.durable-live.config.ts' if durable_mode else 'playwright.schedule-live.config.ts' if schedule_mode else 'playwright.numeric-live.config.ts' if numeric_mode else 'playwright.state-live.config.ts' if os.environ.get('LIVE_STATE_ONLY') == '1' else 'playwright.automation-live.config.ts'],
                cwd=WEB, env=env, timeout=300)
            proof = await asyncio.to_thread(evidence)
            proof['browser_exit'] = result.returncode
            (WEB / 'test-results' / ('metadata-live-evidence.json' if metadata_mode else 'durable-live-evidence.json' if durable_mode else 'schedule-live-evidence.json' if schedule_mode else 'numeric-live-evidence.json' if numeric_mode else 'state-live-evidence.json' if os.environ.get('LIVE_STATE_ONLY') == '1' else 'automation-live-evidence.json')).write_text(json.dumps(proof, indent=2))
            # Browser scenarios prescribe one confirmed run, one refused ACK, one unknown.
            if metadata_mode:
                assert result.returncode == 0, 'Metadata live browser checks failed'
                assert proof['physical_devices'] == '0'
                assert not proof['received'] and not proof['commands'], 'Metadata edits sent commands'
                proof['verification'] = 'metadata-cas-zero-commands'
            elif durable_mode:
                assert result.returncode == 0, 'Durable live browser checks failed'
                assert proof['physical_devices'] == '0'
                proof['verification'] = verify(proof, {'applied': 3})
            elif numeric_mode or schedule_mode:
                assert result.returncode == 0, 'Schedule/numeric live browser checks failed'
                assert proof['physical_devices'] == '0'
                proof['verification'] = verify(proof, {'applied': 1})
            elif os.environ.get('LIVE_STATE_ONLY') == '1':
                assert result.returncode == 0, 'Live state browser checks failed'
                assert not proof['received'] and not proof['commands'], 'Read-only state test sent commands'
                assert proof['physical_devices'] == '0'
                assert len(proof['triggers']) >= 6, 'Missing external MQTT state updates'
                proof['verification'] = 'external-state-read-only'
                (WEB / 'test-results' / 'state-live-evidence.json').write_text(json.dumps(proof, indent=2))
            else:
                proof['verification'] = verify(proof, {'applied': 1, 'failed': 1, 'timed_out': 1})
            (WEB / 'test-results' / ('metadata-live-evidence.json' if metadata_mode else 'durable-live-evidence.json' if durable_mode else 'schedule-live-evidence.json' if schedule_mode else 'numeric-live-evidence.json' if numeric_mode else 'state-live-evidence.json' if os.environ.get('LIVE_STATE_ONLY') == '1' else 'automation-live-evidence.json')).write_text(json.dumps(proof, indent=2))
            assert not receiver.done(), 'Software receiver stopped'
        finally:
            server.close()
            await server.wait_closed()
            receiver.cancel()
            try:
                await receiver
            except asyncio.CancelledError:
                pass


async def main():
    (WEB / 'test-results').mkdir(exist_ok=True)
    async with stack(CORE) as values:
        await acceptance(values)


if __name__ == '__main__':
    asyncio.run(main())
