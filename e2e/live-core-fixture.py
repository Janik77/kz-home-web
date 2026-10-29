"""Operator helper: Core SDK imports only; never writes Core files or global seeds."""
import json
import os
import re
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, os.environ["LIVE_CORE_SOURCE"])

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.orm import Session
from app.models import (
    DeviceORM, EventLogORM, HouseMembershipORM, HouseORM,
    RefreshSessionORM, RoomORM, SceneORM, UserORM,
)
from app.repositories import UserRepository
from app.services.auth_service import UserService

data = json.load(sys.stdin)
prefix = data["prefix"]
assert re.fullmatch(r"web-live-[a-f0-9]{32}", prefix)
email = prefix + "@example.invalid"
engine = create_engine(os.environ["LIVE_CORE_DATABASE_URL"])
assert engine.url.host == "127.0.0.1" and engine.url.port == 15432
assert engine.url.database == "kzhome_local"
house_ids = [prefix + "-home", prefix + "-empty"]
with Session(engine) as session:
    user = session.scalar(select(UserORM).where(UserORM.email == email))
    if data["action"] == "create":
        assert user is None, "Never reuse an existing account"
        user = UserService(UserRepository(session)).create(email, data["password"])
        print(json.dumps({"userId": user.id}))
    elif data["action"] == "inspect":
        sessions = list(session.scalars(select(RefreshSessionORM).where(
            RefreshSessionORM.user_id == user.id))) if user else []
        device = session.get(DeviceORM, prefix + "-light")
        print(json.dumps({
            "userExists": user is not None,
            "houses": session.scalar(select(func.count()).select_from(HouseORM).where(HouseORM.id.in_(house_ids))),
            "rooms": session.scalar(select(func.count()).select_from(RoomORM).where(RoomORM.id == prefix + "-room")),
            "scenes": session.scalar(select(func.count()).select_from(SceneORM).where(SceneORM.id == prefix + "-scene")),
            "deviceState": device.state if device else None,
            "activeSessions": sum(s.revoked_at is None for s in sessions),
            "revokedSessions": sum(s.revoked_at is not None for s in sessions),
        }))
    elif data["action"] == "cleanup":
        # Refuse cleanup if anything was shared with a different account.
        members = list(session.scalars(select(HouseMembershipORM).where(
            HouseMembershipORM.house_id.in_(house_ids))))
        assert all(user is not None and m.user_id == user.id for m in members)
        if user:
            session.execute(delete(RefreshSessionORM).where(RefreshSessionORM.user_id == user.id))
            session.execute(delete(HouseMembershipORM).where(HouseMembershipORM.user_id == user.id))
        session.execute(delete(EventLogORM).where(EventLogORM.house_id.in_(house_ids)))
        for house_id in house_ids:
            house = session.get(HouseORM, house_id)
            if house:
                session.delete(house)  # ORM cascades only through these disposable houses.
        session.flush()
        if user:
            session.delete(user)
        session.commit()
        print(json.dumps({"cleaned": True}))
    else:
        raise ValueError("Unknown action")
engine.dispose()
