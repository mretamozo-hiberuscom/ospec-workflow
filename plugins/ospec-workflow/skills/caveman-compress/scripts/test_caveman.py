#!/usr/bin/env python3
"""Unit tests for the caveman-compress package.

Run from skills/caveman-compress/:

    python -m unittest scripts.test_caveman

Covers the error and recovery paths the 4R reliability/resilience review flagged:
backup-guard, retry-restore, atomic-write data-loss window, validate() input
validation, call_claude SDK fallback, and detect config/code classification.
"""

import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from . import compress, detect, validate


ORIGINAL = "# Title\n\nSee https://example.com/docs for details.\n\n- one\n- two\n"


class ValidateInputTests(unittest.TestCase):
    def test_missing_original_raises_valueerror(self):
        with TemporaryDirectory() as d:
            comp = Path(d) / "comp.md"
            comp.write_text(ORIGINAL)
            with self.assertRaises(ValueError):
                validate.validate(Path(d) / "missing.md", comp)

    def test_missing_compressed_raises_valueerror(self):
        with TemporaryDirectory() as d:
            orig = Path(d) / "orig.md"
            orig.write_text(ORIGINAL)
            with self.assertRaises(ValueError):
                validate.validate(orig, Path(d) / "missing.md")


class CompressFileTests(unittest.TestCase):
    def test_aborts_when_backup_already_exists(self):
        with TemporaryDirectory() as d:
            target = Path(d) / "note.md"
            target.write_text(ORIGINAL)
            (Path(d) / "note.original.md").write_text("prior backup")

            with mock.patch.object(compress, "call_claude") as called:
                result = compress.compress_file(target)

            self.assertFalse(result)
            called.assert_not_called()
            self.assertEqual(target.read_text(), ORIGINAL)
            self.assertEqual((Path(d) / "note.original.md").read_text(), "prior backup")

    def test_restores_original_after_failed_retries(self):
        with TemporaryDirectory() as d:
            target = Path(d) / "note.md"
            target.write_text(ORIGINAL)

            # Always drop the URL so validation fails on every attempt.
            with mock.patch.object(compress, "call_claude", return_value="# Title\n\n- one\n"):
                result = compress.compress_file(target)

            self.assertFalse(result)
            self.assertEqual(target.read_text(), ORIGINAL, "original must be restored")
            self.assertFalse((Path(d) / "note.original.md").exists(), "backup must be removed")

    def test_successful_compression_keeps_backup(self):
        with TemporaryDirectory() as d:
            target = Path(d) / "note.md"
            target.write_text(ORIGINAL)

            # Returning the original verbatim passes every validator.
            with mock.patch.object(compress, "call_claude", return_value=ORIGINAL):
                result = compress.compress_file(target)

            self.assertTrue(result)
            self.assertEqual((Path(d) / "note.original.md").read_text(), ORIGINAL)

    def test_compressed_write_failure_preserves_original(self):
        # C1: a failure writing the compressed body must not corrupt the file.
        with TemporaryDirectory() as d:
            target = Path(d) / "note.md"
            target.write_text(ORIGINAL)

            with mock.patch.object(
                compress, "call_claude", return_value="compressed body"
            ), mock.patch.object(
                compress, "_atomic_write", side_effect=OSError("disk full")
            ):
                with self.assertRaises(OSError):
                    compress.compress_file(target)

            self.assertEqual(target.read_text(), ORIGINAL, "file must be untouched")
            self.assertFalse(
                (Path(d) / "note.original.md").exists(),
                "backup must be removed so a re-run is not blocked",
            )


class CallClaudeTests(unittest.TestCase):
    def test_sdk_failure_falls_back_to_cli(self):
        fake_anthropic = mock.MagicMock()
        fake_anthropic.Anthropic.return_value.messages.create.side_effect = RuntimeError(
            "rate limited"
        )
        cli_result = mock.MagicMock(stdout="cli output")

        with mock.patch.dict("os.environ", {"ANTHROPIC_API_KEY": "key"}), mock.patch.dict(
            sys.modules, {"anthropic": fake_anthropic}
        ), mock.patch.object(compress.subprocess, "run", return_value=cli_result) as run:
            out = compress.call_claude("prompt")

        self.assertEqual(out, "cli output")
        run.assert_called_once()


class DetectClassificationTests(unittest.TestCase):
    def test_config_extension_classified_as_config(self):
        self.assertEqual(detect.detect_file_type(Path("settings.json")), "config")
        self.assertEqual(detect.detect_file_type(Path("config.yaml")), "config")

    def test_code_extension_classified_as_code(self):
        self.assertEqual(detect.detect_file_type(Path("module.py")), "code")
        self.assertEqual(detect.detect_file_type(Path("app.go")), "code")

    def test_markdown_classified_as_natural_language(self):
        self.assertEqual(detect.detect_file_type(Path("README.md")), "natural_language")


if __name__ == "__main__":
    unittest.main()
