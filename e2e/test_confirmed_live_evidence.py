"""Offline negative tests for the verifier; never substituted for live CI."""
import copy
import unittest
from confirmed_live_evidence import PREFIX, verify


def sample():
    rows, received, published = [], [], [{"topic": PREFIX + "/state", "qos": 1, "retain": True,
        "payload": {"protocol_version": "v1", "correlation_id": "initial-state", "state": {"on": False}}}]
    for index in range(18):
        identifier, correlation = f"command-{index}", f"correlation-{index}"
        status = "applied" if index < 16 else "failed" if index == 16 else "timed_out"
        on = index % 2 == 0
        rows.append({"command_id": identifier, "correlation_id": correlation, "status": status,
            "requested_on": on, "reported_on": on if status == "applied" else None,
            "ack_status": status if status != "timed_out" else None,
            "failure_code": None if status == "applied" else "device_failed" if status == "failed" else "deadline_exceeded",
            "ack_received_at": "2026-11-12T00:00:00Z" if status != "timed_out" else None,
            "state_received_at": "2026-11-12T00:00:00Z" if status == "applied" else None})
        received.append({"command_id": identifier, "correlation_id": correlation,
            "on": on, "topic": PREFIX + "/set", "qos": 1, "retain": False})
        if status != "timed_out":
            published.append({"topic": PREFIX + "/ack", "qos": 1, "retain": False,
                "payload": {"protocol_version": "v1", "command_id": identifier, "correlation_id": correlation, "status": status}})
        if status == "applied":
            published.append({"topic": PREFIX + "/state", "qos": 1, "retain": True,
                "payload": {"protocol_version": "v1", "correlation_id": correlation, "state": {"on": on}}})
    return {"browser_exit": 0, "physical_devices": "0", "received": received, "published": published,
        "database": {"commands": rows, "counts": ["applied|16", "failed|1", "timed_out|1"], "invalid_applied": "0"}}


class EvidenceTests(unittest.TestCase):
    def rejected(self, evidence):
        with self.assertRaises(AssertionError):
            verify(evidence)

    def test_complete_run_and_reordered_messages(self):
        evidence = sample()
        self.assertEqual(verify(evidence)["commands_verified"], 18)
        evidence["received"].reverse()
        evidence["published"].reverse()
        verify(evidence)

    def test_each_of_18_set_intents_and_correlations(self):
        for index in range(18):
            for field, value in (("on", "not-bool"), ("correlation_id", "other"),
                                 ("topic", PREFIX + "/control/command"), ("qos", 0), ("retain", True)):
                with self.subTest(command=index, field=field):
                    evidence = sample()
                    evidence["received"][index][field] = value
                    self.rejected(evidence)

    def test_every_ack_and_state_is_required_and_exact(self):
        for index, item in enumerate(sample()["published"]):
            for field, value in (("correlation_id", "wrong"), ("protocol_version", "v2")):
                with self.subTest(publication=index, field=field):
                    evidence = sample()
                    evidence["published"][index]["payload"][field] = value
                    self.rejected(evidence)
            for field, value in (("qos", 0), ("retain", not item["retain"]), ("topic", "foreign/topic")):
                with self.subTest(publication=index, field=field):
                    evidence = sample()
                    evidence["published"][index][field] = value
                    self.rejected(evidence)
            evidence = sample()
            evidence["published"].pop(index)
            self.rejected(evidence)
            evidence = sample()
            evidence["published"].append(copy.deepcopy(item))
            self.rejected(evidence)
            evidence = sample()
            payload = evidence["published"][index]["payload"]
            if item["topic"].endswith('/ack'):
                payload["status"] = "wrong"
            else:
                payload["state"]["on"] = not payload["state"]["on"]
            self.rejected(evidence)

    def test_failed_and_timeout_must_not_acquire_state_or_positive_ack(self):
        for index in (16, 17):
            evidence = sample()
            row = evidence["database"]["commands"][index]
            unexpected = copy.deepcopy(evidence["published"][0])
            unexpected["payload"]["correlation_id"] = row["correlation_id"]
            evidence["published"].append(unexpected)
            self.rejected(evidence)
        evidence = sample()
        row = evidence["database"]["commands"][17]
        evidence["published"].append({"topic": PREFIX + "/ack", "qos": 1, "retain": False,
            "payload": {"protocol_version": "v1", "command_id": row["command_id"],
                        "correlation_id": row["correlation_id"], "status": "applied"}})
        self.rejected(evidence)

    def test_sql_evidence_on_every_outcome(self):
        for index, row in enumerate(sample()["database"]["commands"]):
            fields = {"ack_status": "wrong", "failure_code": "wrong", "reported_on": "wrong",
                      "ack_received_at": None if row["ack_received_at"] else "unexpected",
                      "state_received_at": None if row["state_received_at"] else "unexpected"}
            for field, value in fields.items():
                with self.subTest(command=index, field=field):
                    evidence = sample()
                    evidence["database"]["commands"][index][field] = value
                    self.rejected(evidence)

    def test_missing_extra_and_duplicate_commands(self):
        for key in ('received', 'commands'):
            for operation in ('remove', 'extra', 'duplicate'):
                evidence = sample()
                rows = evidence[key] if key == 'received' else evidence['database'][key]
                if operation == 'remove':
                    rows.pop()
                elif operation == 'extra':
                    rows.append(copy.deepcopy(rows[0]))
                else:
                    rows[-1] = copy.deepcopy(rows[0])
                self.rejected(evidence)


if __name__ == '__main__':
    unittest.main()
