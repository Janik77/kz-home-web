"""Scene lifecycle keeps metadata actions distinct from one explicit relay execution."""
import ast
import unittest
from pathlib import Path

class SceneEditFixtureContract(unittest.TestCase):
    def test_existing_control_contract_and_strict_single_receipt(self):
        base = Path(__file__).parent
        runner = (base / 'automation-live-runner.py').read_text()
        ast.parse(runner)
        spec = (base / 'scene-edit-live.spec.ts').read_text()
        self.assertIn("LIVE_SCENE_EDIT_ONLY", runner)
        self.assertIn("'playwright.scene-edit-live.config.ts' if scene_edit_mode", runner)
        self.assertIn("proof['verification'] = verify(proof, {'applied': 1})", runner)
        self.assertIn("assert schedule_mode or scene_edit_mode", runner)
        for action in ('mode', 'evidence', 'refresh'):
            self.assertIn(f"'/{action}'", runner)
            self.assertIn(f"control('{action}'", spec)
        self.assertGreaterEqual(spec.count(".received).toHaveLength(0)"), 3)
        self.assertIn("/v1/houses/fixture_house/scene-runs/execute", spec)
        self.assertIn("expect(rejected.status()).toBe(409)", spec)
        self.assertIn("'scene_draft'", spec)
        self.assertIn("status:'applied',requested_on:true,reported_on:true", spec)
        self.assertIn("expect(proof.received).toHaveLength(1)", spec)
        self.assertIn("expect(proof.commands).toHaveLength(1)", spec)
