"""Independent MQTT/SQL receipt checks for real automation acceptance.

Input evidence contains only disposable identities, never credentials.
Trigger frames are separate from command-result frames, so replaying a trigger
cannot disguise an extra command or manufacture a successful receipt.
"""
from collections import Counter


def verify(evidence, expected):
    assert evidence['browser_exit'] == 0, 'Browser acceptance failed'
    assert evidence['physical_devices'] == '0', 'Physical identity in software test'
    assert evidence['core_sha'] and evidence['web_sha'], 'Missing exact source versions'
    rows = evidence['commands']
    messages = evidence['received']
    assert Counter(row['status'] for row in rows) == expected
    assert len(rows) == len(messages) == sum(expected.values())
    by_id = {row['command_id']: row for row in rows}
    assert len(by_id) == len(rows), 'Duplicate SQL command identity'
    assert len({row['correlation_id'] for row in rows}) == len(rows)
    assert {m['command_id'] for m in messages} == set(by_id)
    assert len({m['command_id'] for m in messages}) == len(messages), 'Repeated SET'
    correlations = {row['correlation_id'] for row in rows}
    for frame in evidence['published']:
        payload = frame['payload']
        if frame['topic'].endswith('/ack'):
            assert payload['command_id'] in by_id, 'Unrelated ACK'
        elif frame['topic'].endswith('/state'):
            assert payload['correlation_id'] in correlations | {'initial-state'}, 'Unrelated result state'
        else:
            raise AssertionError('Unexpected result topic')
    for message in messages:
        row = by_id[message['command_id']]
        assert message['correlation_id'] == row['correlation_id']
        assert message['qos'] == 1 and message['retain'] is False
        assert message['topic'] == 'kzhome/v1/fixture_house/fixture_relay/set'
        assert type(message['on']) is bool and message['on'] is row['requested_on']
        acknowledgements = [p for p in evidence['published']
                            if p['topic'].endswith('/ack') and p['payload']['command_id'] == row['command_id']]
        states = [p for p in evidence['published']
                  if p['topic'].endswith('/state') and p['payload']['correlation_id'] == row['correlation_id']]
        for frame in acknowledgements + states:
            assert frame['qos'] == 1
            assert frame['payload']['protocol_version'] == 'v1'
            assert frame['payload']['correlation_id'] == row['correlation_id']
            assert frame['retain'] is frame['topic'].endswith('/state')
        if row['status'] == 'applied':
            assert len(acknowledgements) == len(states) == 1
            assert acknowledgements[0]['payload']['status'] == 'applied'
            assert states[0]['payload']['state']['on'] is row['requested_on']
            assert row['reported_on'] is row['requested_on']
            assert row['ack_status'] == 'applied'
            assert row['state_received_at'] and row['ack_received_at']
        elif row['status'] == 'failed':
            assert len(acknowledgements) == 1 and not states
            assert acknowledgements[0]['payload']['status'] == 'failed'
        elif row['status'] == 'timed_out':
            assert not acknowledgements and not states
        else:
            raise AssertionError('Unexpected command terminal state')
    return {'verified_commands': len(rows), 'outcomes': dict(expected), 'physical': False}
