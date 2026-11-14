"""Ensure fresh fixture setup explicitly supports restrictive caller umask."""
import os
import unittest
from unittest.mock import patch
from pathlib import Path
import shutil
import confirmed_live_stack as stack

class FixtureModes(unittest.TestCase):
    def test_private_material_is_assigned_to_broker_before_launch(self):
        calls = []
        def docker(*args, **kwargs):
            calls.append(args)
            if args[:2] == ('network', 'create'): return 'owned-network'
            if args[:2] == ('exec', services.name + '-pg'): return 'accepting connections'
            if args[0] == 'port': return '127.0.0.1:12345'
            return ''
        previous = os.umask(0o077)
        services = stack.Services()
        try:
            with patch.object(stack, 'docker', side_effect=docker): services.start()
            setup = [c for c in calls if '-ec' in c][0]
            self.assertIn('chown 1883:1883 /lab/passwd /lab/server.key', setup[-1])
            self.assertIn('chmod 0400 /lab/passwd /lab/server.key', setup[-1])
            self.assertIn('chmod 0444 /lab/acl /lab/mosquitto.conf /lab/ca.crt /lab/server.crt', setup[-1])
            mqtt = next(c for c in calls if '--name' in c and services.name + '-mqtt' in c)
            self.assertLess(calls.index(setup), calls.index(mqtt))
            self.assertIn(f'type=bind,source={services.directory},target=/lab', setup)
            self.assertEqual(Path(services.directory / 'passwd').stat().st_mode & 0o777, 0o600)
        finally:
            os.umask(previous)
            shutil.rmtree(services.directory)
