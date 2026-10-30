"""Owned-stack browser acceptance. Core imports are read-only; no installed data writes.

Run with the IDE-verified Core SDK and -B. Credentials exist only in process memory
and the Core fixture's private temporary inputs, which its finally block removes.
"""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import sys
import tempfile

WEB = Path(__file__).resolve().parents[1]
CORE = Path(os.environ.get("LIVE_CORE_SOURCE", "C:/projects/kz-home-core")).resolve()
sys.dont_write_bytecode = True
sys.path[:0] = [str(CORE), str(CORE / "tests")]

import aiomqtt
from app.transports.mqtt_models import AckEnvelope, CommandEnvelope
from app.transports.mqtt_topics import TopicKind
from simulator.mqtt_relay import Relay, utc_now
from test_physical_acceptance import provision
from test_physical_acceptance_live import command, ready, stack


def inventory():
    def docker(*args):
        return subprocess.check_output(["docker", *args], text=True).strip()
    ids = docker("ps", "-aq").splitlines()
    containers = {}
    for item in json.loads(docker("inspect", *ids)) if ids else []:
        fingerprint = {key: item[key] for key in ("Id", "Image", "Config", "Mounts", "HostConfig")}
        containers[item["Id"]] = {
            "name": item["Name"], "started": item["State"]["StartedAt"],
            "status": item["State"]["Status"], "restarts": item["RestartCount"],
            "configuration_sha256": hashlib.sha256(json.dumps(fingerprint, sort_keys=True).encode()).hexdigest(),
        }
    return {"containers": containers,
            "volumes": sorted(docker("volume", "ls", "-q").splitlines()),
            "networks": sorted(docker("network", "ls", "--format", "{{.ID}} {{.Name}}").splitlines()),
            "images": sorted(docker("image", "ls", "--no-trunc", "--format", "{{.ID}} {{.Repository}}:{{.Tag}}").splitlines())}


async def acceptance(values):
    dc, config, _, seed, ids, api = values
    await ready(api)
    await provision(api, ids, seed)
    schema = await api.request("GET", "/openapi.json")
    assert "/v1/devices/{device_id}/commands" in schema["paths"]
    assert "/v1/houses/{house_id}/commands/{command_id}" in schema["paths"]
    assert "/v1/houses/{house_id}/me/permissions" in schema["paths"]
    received, published, held = [], [], []
    mode = "apply"
    control_key = secrets.token_urlsafe(32)

    def sql(query):
        return command([*dc, "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "kzhome", "-At", "-c", query])

    assert sql("SELECT version_num FROM alembic_version") == "0006_command_lifecycle"
    print("Isolated Core ready: command API present, PostgreSQL migration 0006_command_lifecycle", flush=True)
    async with aiomqtt.Client(hostname=config.host, port=config.port, username=config.username,
                              password=config.password, identifier=config.client_id,
                              tls_context=ssl.create_default_context(cafile=config.ca_file)) as mqtt:
        async def publish(topic, payload, **kwargs):
            data = json.loads(payload)
            if str(topic).endswith(("/ack", "/state")):
                published.append({"topic": str(topic), "payload": data, "retain": kwargs.get("retain")})
            await mqtt.publish(topic, payload, **kwargs)
        relay = Relay(config.house_id, config.device_id, publish)
        await mqtt.subscribe(relay.topic(TopicKind.SET), qos=1)
        await relay.send(TopicKind.STATUS, relay.status(True))
        await relay.state("initial-state")

        async def receive():
            async for item in mqtt.messages:
                envelope = CommandEnvelope.model_validate_json(bytes(item.payload))
                assert not item.retain
                received.append({"command_id": envelope.command_id, "correlation_id": envelope.correlation_id,
                                 "on": envelope.state["on"], "topic": str(item.topic)})
                if mode == "hold":
                    held.append(item)
                elif mode == "apply":
                    await relay.handle(str(item.topic), bytes(item.payload), item.retain)
                elif mode == "fail":
                    # Fault injected at the software device boundary, not in Core.
                    await relay.send(TopicKind.ACK, AckEnvelope(command_id=envelope.command_id,
                        correlation_id=envelope.correlation_id, timestamp=utc_now(), status="failed"))

        async def device_online():
            for _ in range(100):
                device = await api.request("GET", "/devices/fixture_relay")
                if device["online"] and device["state"].get("on") is False:
                    return
                await asyncio.sleep(0.1)
            raise RuntimeError("Relay online/initial state prerequisite failed")
        await device_online()

        def database():
            rows = sql("SELECT coalesce(json_agg(t),'[]'::json) FROM (SELECT command_id,correlation_id,status,requested_on,reported_on,ack_status,failure_code,state_received_at,ack_received_at FROM device_commands ORDER BY created_at) t")
            return {"migration": sql("SELECT version_num FROM alembic_version"),
                    "counts": sql("SELECT status,count(*) FROM device_commands GROUP BY status ORDER BY status").splitlines(),
                    "invalid_applied": sql("SELECT count(*) FROM device_commands WHERE status='applied' AND (ack_status IS DISTINCT FROM 'applied' OR state_received_at IS NULL OR reported_on IS DISTINCT FROM requested_on)"),
                    "commands": json.loads(rows)}

        async def control(reader, writer):
            nonlocal mode
            try:
                headers = (await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), 5)).decode("ascii")
                lines = headers.split("\r\n")
                fields = dict(line.split(":", 1) for line in lines[1:] if ":" in line)
                normalized = {key.lower(): value.strip() for key, value in fields.items()}
                if normalized.get("authorization") != "Bearer " + control_key:
                    raise ValueError("Unauthorized fixture control")
                length = int(normalized.get("content-length", "0"))
                assert 0 <= length <= 1024
                data = json.loads(await reader.readexactly(length))
                action = lines[0].split()[1]
                result = {}
                if action == "/mode":
                    assert data["mode"] in ("apply", "hold", "drop", "fail")
                    mode = data["mode"]
                elif action == "/release":
                    for item in held:
                        await relay.handle(str(item.topic), bytes(item.payload), item.retain)
                    held.clear()
                elif action in ("/online", "/offline"):
                    await relay.send(TopicKind.STATUS, relay.status(action == "/online"))
                    for _ in range(100):
                        current = await api.request("GET", "/devices/fixture_relay")
                        if current["online"] == (action == "/online"):
                            break
                        await asyncio.sleep(0.1)
                    else:
                        raise RuntimeError("Status not observed by Core")
                elif action == "/role":
                    assert data["role"] in ("resident", "installer", "technician")
                    await api.request("PATCH", f"/houses/fixture_house/members/{ids['resident']}", {"role": data["role"]})
                elif action == "/revoke":
                    # API helper expects JSON; DELETE is 204, so use real httpx directly.
                    import httpx
                    async with httpx.AsyncClient(base_url=api.base) as http:
                        response = await http.delete(f"/houses/fixture_house/members/{ids['resident']}", headers={"Authorization": "Bearer " + api.token})
                        assert response.status_code == 204
                elif action == "/evidence":
                    result = {"received": received, "published": published, "database": await asyncio.to_thread(database)}
                else:
                    raise ValueError("Unknown fixture action")
                payload = json.dumps(result).encode()
                writer.write(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + str(len(payload)).encode() + b"\r\n\r\n" + payload)
                await writer.drain()
            except Exception:
                writer.write(b"HTTP/1.1 500 Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()

        receiver = asyncio.create_task(receive())
        server = await asyncio.start_server(control, "127.0.0.1", 0)
        try:
            env = {**os.environ, "CONFIRMED_LIVE": "1", "CORE_DEV_PROXY_TARGET": api.base,
                   "RELAY_CONTROL_URL": f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
                   "RELAY_CONTROL_KEY": control_key, "RELAY_OWNER_PASSWORD": seed["password"]}
            result = await asyncio.to_thread(subprocess.run,
                ["npx.cmd", "playwright", "test", "--config", "playwright.confirmed-live.config.ts"],
                cwd=WEB, env=env, timeout=210)
            evidence = {"received": received, "published": published, "database": await asyncio.to_thread(database),
                        "browser_exit": result.returncode}
            (WEB / "test-results" / "confirmed-live-evidence.json").write_text(json.dumps(evidence, indent=2), encoding="utf-8")
            assert result.returncode == 0, "Live browser acceptance failed; see credential-free test output"
            assert not receiver.done(), "Software relay receiver stopped unexpectedly"
        finally:
            server.close()
            await server.wait_closed()
            receiver.cancel()
            try:
                await receiver
            except asyncio.CancelledError:
                pass


def main():
    before = inventory()
    (WEB / "test-results").mkdir(exist_ok=True)
    print(f"Baseline: {len(before['containers'])} containers, {len(before['volumes'])} volumes; isolated fixture only", flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix="kzhome-web-v016-") as temporary:
            fixture = stack.__wrapped__(Path(temporary))
            try:
                values = next(fixture)
                if os.name == "nt":
                    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
                asyncio.run(acceptance(values))
            finally:
                fixture.close()
    finally:
        after = inventory()
        result = {"before": before, "after": after, "preserved": before == after}
        (WEB / "test-results" / "confirmed-live-preservation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
        assert before == after, "Docker inventory changed; inspect preservation report, do not delete unrelated resources"
        print("PASS preservation: pre-existing containers/config/start times, volumes, networks and images unchanged; fixture removed", flush=True)


if __name__ == "__main__":
    main()
