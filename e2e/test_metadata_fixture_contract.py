"""Metadata CI fixture uses existing software identity and never commands a relay."""
import ast
import unittest
from pathlib import Path

class MetadataFixtureContract(unittest.TestCase):
    def test_metadata_mode_preserves_zero_command_acceptance(self):
        base = Path(__file__).parent
        runner = (base / 'automation-live-runner.py').read_text()
        ast.parse(runner)
        spec = (base / 'metadata-live.spec.ts').read_text()
        self.assertIn("LIVE_METADATA_ONLY", runner)
        self.assertIn("'playwright.metadata-live.config.ts' if metadata_mode", runner)
        self.assertIn("assert not proof['received'] and not proof['commands'], 'Metadata edits sent commands'", runner)
        self.assertIn("'/evidence'", runner)
        self.assertIn("expect(proof.received).toHaveLength(0)", spec)
        self.assertIn("expect(proof.commands).toHaveLength(0)", spec)
        self.assertNotIn("/commands", spec)
        self.assertNotIn("/execute", spec)
        self.assertIn("expected_metadata_revision", spec)
        self.assertIn("['resident', 'foreign']", spec)
