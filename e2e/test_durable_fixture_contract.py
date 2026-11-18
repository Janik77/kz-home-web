"""Cheap static contract guard: no service creation or filesystem cleanup."""
import ast
import re
import unittest
from pathlib import Path

class DurableFixtureContract(unittest.TestCase):
    def test_all_control_calls_have_actual_automation_runner_handlers(self):
        base = Path(__file__).parent
        spec = (base / 'durable-live.spec.ts').read_text(encoding='utf8')
        runner = (base / 'automation-live-runner.py').read_text(encoding='utf8')
        values = {node.value for node in ast.walk(ast.parse(runner)) if isinstance(node, ast.Constant) and isinstance(node.value, str)}
        calls = set(re.findall(r"control\('([^']+)'", spec))
        self.assertEqual(calls, {'mode', 'evidence'})
        self.assertTrue({'/' + call for call in calls} <= values)
        self.assertIn("control('mode',{mode:'apply'})", spec)
        self.assertIn("assert data['mode'] in ('apply', 'fail', 'drop')", runner)
        self.assertIn('relay.status(True)', runner)
        self.assertIn("relay.state('initial-state')", runner)
        self.assertIn('toEqual({online:true,on:false})', spec)
