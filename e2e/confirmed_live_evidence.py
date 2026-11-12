"""Strict whole-run MQTT/SQL verification, independent of browser assertions."""
from collections import Counter

PREFIX = "kzhome/v1/fixture_house/fixture_relay"
EXPECTED = {"applied": 16, "failed": 1, "timed_out": 1}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def verify(evidence):
    require(evidence["browser_exit"] == 0, "Live browser acceptance failed")
    require(evidence["physical_devices"] == "0", "Unexpected physical identity")
    database = evidence["database"]
    commands, received, published = database["commands"], evidence["received"], evidence["published"]
    require(len(commands) == len(received) == 18, "Expected exactly 18 SQL and MQTT commands")
    require(Counter(row["status"] for row in commands) == EXPECTED, "Unexpected SQL outcomes")
    require(database["counts"] == ["applied|16", "failed|1", "timed_out|1"], "SQL aggregate mismatch")
    require(database["invalid_applied"] == "0", "SQL reports invalid applied receipt")
    rows = {row["command_id"]: row for row in commands}
    correlations = {row["correlation_id"]: row for row in commands}
    wire = {row["command_id"]: row for row in received}
    require(len(rows) == len(correlations) == len(wire) == 18, "Duplicate command/correlation identity")
    require(set(rows) == set(wire), "MQTT and SQL command identities differ")
    acks, states = {}, {}
    initial = 0
    for item in published:
        payload = item["payload"]
        topic = item["topic"]
        require(item["qos"] == 1, "Unexpected MQTT QoS")
        require(payload["protocol_version"] == "v1", "Unexpected MQTT protocol")
        if topic == PREFIX + "/ack":
            require(item["retain"] is False, "ACK must not be retained")
            identifier = payload["command_id"]
            require(identifier in rows and identifier not in acks, "Unknown or duplicate ACK")
            require(payload["correlation_id"] == rows[identifier]["correlation_id"], "ACK correlation mismatch")
            acks[identifier] = payload
        elif topic == PREFIX + "/state":
            require(item["retain"] is True, "State must be retained")
            correlation = payload["correlation_id"]
            if correlation == "initial-state":
                initial += 1
                require(payload["state"] == {"on": False} and payload["state"]["on"] is False, "Invalid initial state")
            else:
                require(correlation in correlations and correlation not in states, "Unknown or duplicate state")
                states[correlation] = payload
        else:
            raise AssertionError("Unexpected publication topic")
    require(initial == 1, "Expected exactly one initial state")
    for identifier, row in rows.items():
        message = wire[identifier]
        correlation = row["correlation_id"]
        require(message["correlation_id"] == correlation, "SET correlation mismatch")
        require(message["topic"] == PREFIX + "/set", "SET topic mismatch")
        require(message["qos"] == 1 and message["retain"] is False, "Invalid SET delivery policy")
        require(type(message["on"]) is bool and message["on"] is row["requested_on"], "SET intent mismatch")
        ack, state = acks.get(identifier), states.get(correlation)
        if row["status"] == "applied":
            require(ack is not None and ack["status"] == "applied", "Applied receipt missing applied ACK")
            require(state is not None and state["state"] == {"on": row["requested_on"]} and state["state"]["on"] is row["requested_on"], "Applied state mismatch")
            require(row["reported_on"] is row["requested_on"], "SQL requested/reported mismatch")
            require(row["ack_status"] == "applied" and row["failure_code"] is None, "Applied SQL status mismatch")
            require(bool(row["ack_received_at"]) and bool(row["state_received_at"]), "Applied SQL evidence missing")
        elif row["status"] == "failed":
            require(ack is not None and ack["status"] == "failed" and state is None, "Failed receipt must have only failed ACK")
            require(row["ack_status"] == "failed" and row["failure_code"] == "device_failed", "Failed SQL status mismatch")
            require(bool(row["ack_received_at"]), "Failed SQL ACK timestamp missing")
            require(row["state_received_at"] is None and row["reported_on"] is None, "Failed receipt has state evidence")
        else:
            require(ack is None and state is None, "Timed-out command unexpectedly has ACK/state")
            require(row["ack_status"] is None and row["failure_code"] == "deadline_exceeded", "Timeout SQL status mismatch")
            require(all(row[key] is None for key in ("ack_received_at", "state_received_at", "reported_on")), "Timeout has SQL response evidence")
    return {"commands_verified": 18, "applied": 16, "failed": 1, "timed_out": 1,
            "ack_state_and_sql_consistent": True}
