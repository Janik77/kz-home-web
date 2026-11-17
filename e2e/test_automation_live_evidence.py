import copy
import unittest
from automation_live_evidence import verify


def fixture():
    command = {'command_id': 'c1', 'correlation_id': 'r1', 'status': 'applied',
               'requested_on': True, 'reported_on': True, 'ack_status': 'applied',
               'state_received_at': 'now', 'ack_received_at': 'now'}
    prefix = 'kzhome/v1/fixture_house/fixture_relay'
    return {'browser_exit': 0, 'physical_devices': '0', 'core_sha': 'a' * 40,
            'web_sha': 'b' * 40, 'commands': [command], 'received': [
                {'command_id': 'c1', 'correlation_id': 'r1', 'on': True,
                 'qos': 1, 'retain': False, 'topic': prefix + '/set'}],
            'published': [
                {'topic': prefix + '/ack', 'qos': 1, 'retain': False,
                 'payload': {'command_id': 'c1', 'correlation_id': 'r1', 'protocol_version': 'v1', 'status': 'applied'}},
                {'topic': prefix + '/state', 'qos': 1, 'retain': True,
                 'payload': {'correlation_id': 'r1', 'protocol_version': 'v1', 'state': {'on': True}}}]}


class EvidenceTests(unittest.TestCase):
    def test_complete_receipt(self):
        self.assertEqual(verify(fixture(), {'applied': 1})['verified_commands'], 1)

    def test_reject_mutations(self):
        mutations = [
            lambda x: x.update(browser_exit=1),
            lambda x: x.update(physical_devices='1'),
            lambda x: x.update(core_sha=''),
            lambda x: x['received'].append(copy.deepcopy(x['received'][0])),
            lambda x: x['received'][0].update(correlation_id='other'),
            lambda x: x['received'][0].update(retain=True),
            lambda x: x['received'][0].update(on=1),
            lambda x: x['commands'][0].update(ack_status='failed'),
            lambda x: x['commands'][0].update(state_received_at=None),
            lambda x: x['published'].pop(),
            lambda x: x['published'][1]['payload']['state'].update(on=False),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                value = fixture()
                mutate(value)
                with self.assertRaises(AssertionError):
                    verify(value, {'applied': 1})

    def test_failed_ack(self):
        value = fixture()
        value['commands'][0]['status'] = 'failed'
        value['published'][0]['payload']['status'] = 'failed'
        value['published'].pop()
        verify(value, {'failed': 1})

    def test_unknown_requires_absence_of_ack_and_state(self):
        value = fixture()
        value['commands'][0]['status'] = 'timed_out'
        with self.assertRaises(AssertionError):
            verify(value, {'timed_out': 1})
        value['published'] = []
        verify(value, {'timed_out': 1})
