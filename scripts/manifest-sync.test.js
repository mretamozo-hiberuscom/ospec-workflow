"use strict";

// The repo ships two plugin manifests on purpose:
//   - .plugin.json                 canonical, read by VS Code / direct-load
//   - .claude-plugin/plugin.json   compatibility copy, read by the Claude
//                                  distribution and the generator (cli.js source)
// They MUST describe the same plugin (same name, version, component wiring) or a
// consumer loads stale metadata. Nothing derives one from the other, so this test
// is the contract that keeps them from drifting. If you change one, change both.
//
// The published release version is whatever .claude-plugin/plugin.json carries at
// tag time (publish-marketplace.yml reads it via cli.js). A release bump that
// touches package.json but not the manifests therefore ships a STALE plugin
// version while every cross-manifest check still passes. That actually happened
// for 2.4.8: package.json was bumped first, the manifests lagged at 2.4.7, and
// the release branch was published as 2.4.7. So this test also pins package.json
// and openspec/config.yaml to the manifest version: a partial bump now fails CI
// before a release can ship.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const CANONICAL = path.join(ROOT, ".plugin.json");
const CLAUDE_COPY = path.join(ROOT, ".claude-plugin", "plugin.json");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const OPENSPEC_CONFIG = path.join(ROOT, "openspec", "config.yaml");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

test("the canonical and Claude manifests stay in sync", () => {
  const canonical = readJson(CANONICAL);
  const claudeCopy = readJson(CLAUDE_COPY);

  assert.deepEqual(
    claudeCopy,
    canonical,
    ".claude-plugin/plugin.json must mirror the canonical .plugin.json (bump both together)",
  );
});

test("package.json version matches the plugin manifest version", () => {
  const manifestVersion = readJson(CANONICAL).version;
  const packageVersion = readJson(PACKAGE_JSON).version;

  assert.equal(
    packageVersion,
    manifestVersion,
    "package.json version must match .plugin.json (a release bump must update both, or the published plugin ships a stale version)",
  );
});

test("openspec/config.yaml version matches the plugin manifest version", () => {
  const manifestVersion = readJson(CANONICAL).version;
  const configText = fs.readFileSync(OPENSPEC_CONFIG, "utf8");
  const match = configText.match(/^\s*version:\s*(\S+)\s*$/m);

  assert.ok(match, "openspec/config.yaml must declare a project version");
  assert.equal(
    match[1],
    manifestVersion,
    "openspec/config.yaml version must match .plugin.json (bump both together)",
  );
});
