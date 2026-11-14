"""Disposable software-only stack adapted from Firmware #11 Services fixture.

No physical identities, command gate overrides, production inputs or installed data.
Only randomly named containers on an owned bridge network, published on loopback.
"""
import asyncio
from contextlib import asynccontextmanager
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from uuid import uuid4

def docker(*args, check=True, **kwargs):
    result = subprocess.run(
        ["docker", *args], capture_output=True, text=True, timeout=120, **kwargs
    )
    if check and result.returncode:
        raise RuntimeError(
            "Disposable Docker operation failed: " + result.stderr[-1500:]
        )
    return result.stdout.strip()


class Services:
    def __init__(self):
        self.name = "kz-control-lab-" + uuid4().hex[:12]
        self.directory = Path(tempfile.mkdtemp(prefix=self.name + "-"))
        # Mosquitto drops to its own UID inside the container on Linux.
        # Only this ephemeral directory is traversable; no production inputs exist.
        self.directory.chmod(0o755)
        self.password = secrets.token_urlsafe(32)
        self.containers = []
        self.network = None

    def start(self):
        self.network = docker(
            "network", "create", "--label", "kz.control.lab=" + self.name, self.name
        )
        root = self.directory.as_posix()
        # Offline certificate generation: SAN deliberately DNS localhost only.
        certs = """
set -eu
cd /lab
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 1 -subj /CN=KZ-Disposable-Test-CA >/dev/null 2>&1
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj /CN=localhost >/dev/null 2>&1
printf 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n' > extensions
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 1 -extfile extensions >/dev/null 2>&1
openssl req -x509 -newkey rsa:2048 -nodes -keyout wrong.key -out wrong.crt -days 1 -subj /CN=Wrong-Test-CA >/dev/null 2>&1
chmod 644 server.key
"""
        docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--mount",
            f"type=bind,source={root},target=/lab",
            "--entrypoint",
            "sh",
            "alpine/openssl:latest@sha256:6821afa2476e11be343f29275f2ca24291720ff0a7148bd131fd8e314ff26d9e",
            "-c",
            certs,
        )
        users = ("core_lab", "software_lab")
        (self.directory / "passwd").write_text(
            "\n".join(f"{user}:{self.password}" for user in users) + "\n",
            encoding="utf-8",
        )
        docker(
            "run",
            "--rm",
            "--network",
            "none",
            "--mount",
            f"type=bind,source={root},target=/lab",
            "--entrypoint",
            "mosquitto_passwd",
            "eclipse-mosquitto:2@sha256:75d6662dee52c947dc9dd9c29f1d8d7ffef78ddaf38001caa09755681e8bbc98",
            "-U",
            "/lab/passwd",
        )
        prefix = "kzhome/v1/fixture_house/fixture_relay"
        # Required Core wildcard subscriptions can receive only fixture messages;
        # no physical command/control publication permission exists for either user.
        acl = "user core_lab\n" + "\n".join(
            f"topic read kzhome/v1/+/+/{kind}"
            for kind in ("ack", "state", "status", "telemetry")
        ) + f"\ntopic write {prefix}/set\nuser software_lab\n"
        acl += f"topic read {prefix}/set\n" + "\n".join(
            f"topic write {prefix}/{kind}" for kind in ("ack", "state", "status")
        ) + "\n"
        (self.directory / "acl").write_text(acl, encoding="utf-8")
        (self.directory / "mosquitto.conf").write_text(
            """listener 8883
allow_anonymous false
password_file /lab/passwd
acl_file /lab/acl
cafile /lab/ca.crt
certfile /lab/server.crt
keyfile /lab/server.key
tls_version tlsv1.2
persistence false
log_dest stdout
log_type all
""",
            encoding="utf-8",
        )
        pg = self.name + "-pg"
        self.containers.append(pg)
        docker(
            "run",
            "-d",
            "--name",
            pg,
            "--label",
            "kz.control.lab=" + self.name,
            "--network",
            self.network,
            "--tmpfs",
            "/var/lib/postgresql/data:rw",
            "-e",
            "POSTGRES_USER=lab",
            "-e",
            "POSTGRES_DB=lab",
            "-e",
            "POSTGRES_PASSWORD=" + self.password,
            "-p",
            "127.0.0.1::5432",
            "postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994",
        )
        mqtt = self.name + "-mqtt"
        self.containers.append(mqtt)
        docker(
            "run",
            "-d",
            "--name",
            mqtt,
            "--label",
            "kz.control.lab=" + self.name,
            "--network",
            self.network,
            "--mount",
            f"type=bind,source={root},target=/lab,readonly",
            "--tmpfs",
            "/mosquitto/data",
            "--tmpfs",
            "/mosquitto/log",
            "-p",
            "127.0.0.1::8883",
            "eclipse-mosquitto:2@sha256:75d6662dee52c947dc9dd9c29f1d8d7ffef78ddaf38001caa09755681e8bbc98",
            "mosquitto",
            "-c",
            "/lab/mosquitto.conf",
        )
        # The image's temporary init server accepts Unix sockets but not TCP.
        # Wait for the final TCP listener, otherwise the first host connection races
        # the init server shutdown even though socket pg_isready already succeeded.
        for _ in range(60):
            if "accepting connections" in docker(
                "exec",
                pg,
                "pg_isready",
                "-h",
                "127.0.0.1",
                "-U",
                "lab",
                "-d",
                "lab",
                check=False,
            ):
                break
            time.sleep(0.25)
        else:
            raise RuntimeError("Temporary PostgreSQL did not become ready")
        self.pg_port = int(docker("port", pg, "5432/tcp").rsplit(":", 1)[1])
        self.mqtt_port = int(docker("port", mqtt, "8883/tcp").rsplit(":", 1)[1])
        self.url = (
            f"postgresql+psycopg://lab:{self.password}@127.0.0.1:{self.pg_port}/lab"
        )
        print(
            "SERVICES: PostgreSQL 17 + Mosquitto TLS, random loopback ports, fresh tmpfs data",
            flush=True,
        )
        return self

    def close(self):
        for name in reversed(self.containers):
            label = docker(
                "inspect",
                "--format",
                '{{index .Config.Labels "kz.control.lab"}}',
                name,
                check=False,
            )
            if label == self.name:
                docker("rm", "-f", "-v", name)
            elif label:
                raise RuntimeError("Refusing cleanup of foreign container")
        if self.network:
            label = docker(
                "network",
                "inspect",
                "--format",
                '{{index .Labels "kz.control.lab"}}',
                self.network,
            )
            if label != self.name:
                raise RuntimeError("Refusing cleanup of foreign network")
            docker("network", "rm", self.network)
        target = self.directory.resolve()
        if target.parent != Path(
            tempfile.gettempdir()
        ).resolve() or not target.name.startswith(self.name + "-"):
            raise RuntimeError(
                "Refusing cleanup outside the allocated temporary directory"
            )
        shutil.rmtree(target)
        print(
            "CLEANUP: own containers/tmpfs/network/certificates/password files removed",
            flush=True,
        )


@asynccontextmanager
async def stack(core):
    from alembic import command
    from alembic.config import Config as AlembicConfig
    from alembic.script import ScriptDirectory
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session
    from app.core import Settings
    from app.repositories import UserRepository
    from app.services.auth_service import UserService
    from app.transports.mqtt_client import AiomqttClient
    from simulator.e2e_acceptance import API
    from simulator.mqtt_relay import Config
    import uvicorn

    services = Services()
    engine = server = serve_task = sock = None
    try:
        services.start()
        # Explicit owned PostgreSQL URL; Core tests create/drop only random schemas.
        await asyncio.to_thread(subprocess.run,
            [sys.executable, "-m", "pytest", "-q", "tests/test_definition_postgresql.py", "tests/test_scene_runs_postgresql.py", "tests/test_device_favorites_postgresql.py"],
            cwd=core, env={**os.environ, "TEST_POSTGRESQL_URL": services.url,
                "DATABASE_URL": services.url, "APP_ENV": "test",
                "MQTT_ENABLED": "false", "KZHOME_SIMULATOR_ENABLED": "false"},
            check=True, timeout=120)
        engine = create_engine(services.url)
        migration_config = AlembicConfig(str(core / "alembic.ini"))
        migration_config.set_main_option("script_location", str(core / "alembic"))
        migration = ScriptDirectory.from_config(migration_config).get_current_head()
        with engine.begin() as connection:
            migration_config.attributes["connection"] = connection
            command.upgrade(migration_config, "head")
        password = secrets.token_urlsafe(32)
        jwt_secret = secrets.token_urlsafe(48)
        seed = {"password": password}
        ids = {}
        with Session(engine) as session:
            for role in ("owner", "foreign", "resident"):
                ids[role] = UserService(UserRepository(session)).create(
                    f"{role}@example.test", password
                ).id
            session.commit()
        # Production-mode validation avoids loading .env; this is an owned test
        # process/database, not a production installation. No fake transport.
        environment = dict(os.environ)
        try:
            os.environ.clear()
            os.environ.update(APP_ENV="production", DATABASE_URL=services.url,
                MQTT_ENABLED="true", MQTT_TLS_ENABLED="true", MQTT_HOST="localhost",
                MQTT_PORT=str(services.mqtt_port), MQTT_CLIENT_ID="unused-import-app",
                AUTH_JWT_SECRET=jwt_secret)
            from app.main import create_app
        finally:
            os.environ.clear()
            os.environ.update(environment)
        settings = Settings(database_url=services.url, app_env="production",
            auth_jwt_secret=jwt_secret, mqtt_enabled=True, mqtt_host="localhost",
            mqtt_port=services.mqtt_port, mqtt_tls_enabled=True,
            mqtt_client_id=services.name + "-core", mqtt_username="core_lab",
            mqtt_password=services.password,
            mqtt_software_devices=(("fixture_house", "fixture_relay"),))
        wire = AiomqttClient(host="localhost", port=services.mqtt_port,
            username="core_lab", password=services.password, tls_enabled=True,
            keepalive=15, client_id=settings.mqtt_client_id)
        # Supply the disposable CA; hostname/certificate verification stays on.
        wire._options["tls_context"] = ssl.create_default_context(
            cafile=str(services.directory / "ca.crt"))
        app = create_app(settings, run_simulator=False, mqtt_client=wire)
        server = uvicorn.Server(uvicorn.Config(app, log_level="warning",
            access_log=False, lifespan="on", loop="asyncio"))
        sock = socket.socket()
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
        serve_task = asyncio.create_task(server.serve(sockets=[sock]))
        async with asyncio.timeout(30):
            while not server.started or not app.state.mqtt_gateway.connected:
                if serve_task.done():
                    await serve_task
                    raise RuntimeError("Owned Core exited before MQTT readiness")
                await asyncio.sleep(0.05)
        config = Config("localhost", services.mqtt_port, "software_lab",
            services.password, str(services.directory / "ca.crt"),
            "fixture_house", "fixture_relay", services.name + "-relay")
        api = API(f"http://127.0.0.1:{port}")

        def sql(query):
            with engine.begin() as connection:
                result = connection.execute(text(query))
                if not result.returns_rows:
                    return ""
                rows = result.all()
                return "\n".join("|".join(
                    json.dumps(value) if isinstance(value, (dict, list)) else str(value)
                    for value in row) for row in rows)

        assert sql("SELECT count(*) FROM physical_devices") == "0"
        yield config, seed, ids, api, sql, migration
        assert sql("SELECT count(*) FROM physical_devices") == "0"
    finally:
        try:
            if server:
                server.should_exit = True
            if serve_task:
                await asyncio.wait_for(serve_task, 15)
        finally:
            if sock:
                sock.close()
            if engine:
                engine.dispose()
            services.close()


async def provision(api, ids, seed):
    api.token = (await api.request("POST", "/auth/login", {
        "email": "owner@example.test", "password": seed["password"]
    }))["access_token"]
    await api.request("POST", "/houses", {"id": "fixture_house", "name": "Fixture"})
    await api.request("POST", "/floors", {"id": "fixture_floor",
        "house_id": "fixture_house", "name": "Floor", "order": 0})
    await api.request("POST", "/rooms", {"id": "fixture_room",
        "floor_id": "fixture_floor", "name": "Room"})
    await api.request("POST", "/houses/fixture_house/members", {
        "user_id": ids["resident"], "role": "resident"})
    await api.request("POST", "/devices", {"id": "fixture_relay",
        "room_id": "fixture_room", "name": "Software relay", "type": "relay",
        "capabilities": ["on_off"], "state": {}, "online": False})
