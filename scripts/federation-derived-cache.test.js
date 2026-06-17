"use strict";

// WU5 (Phase 6) — atlas-as-derived-cache inversion contract.
//
// The final WU5 slice documents and enforces the derived-cache inversion in two
// source-of-truth files (no executable code changes):
//   - .gitignore                           (openspec/workspace.yaml is a regenerable cache, never committed)
//   - skills/_shared/persistence-contract.md (markers-as-truth + regenerate + warn-on-detect contract)
// These files ARE the WU5 deliverable, so this test pins the required content.
// It mirrors the existing markdown content-contract tests
// (docs-lint.test.js, manifest-sync.test.js, sdd-init-federation.test.js).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const GITIGNORE = path.join(ROOT, ".gitignore");
const CONTRACT = path.join(ROOT, "skills", "_shared", "persistence-contract.md");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

// --- .gitignore : derived cache is never committed --------------------------

test(".gitignore lists openspec/workspace.yaml as a derived cache", () => {
  const text = read(GITIGNORE);
  assert.match(
    text,
    /^\s*openspec\/workspace\.yaml\s*$/m,
    ".gitignore must ignore openspec/workspace.yaml so the derived cache is never committed",
  );
});

// --- persistence-contract.md : atlas-as-derived-cache inversion -------------

test("persistence-contract.md documents the atlas-as-derived-cache inversion", () => {
  const text = read(CONTRACT);
  assert.match(
    text,
    /derived[\s-]?cache/i,
    "persistence-contract.md must describe the atlas-as-derived-cache inversion",
  );
});

test("persistence-contract.md names markers as the sole source of truth", () => {
  const text = read(CONTRACT);
  assert.match(
    text,
    /federation\.member\.yaml/,
    "persistence-contract.md must name openspec/federation.member.yaml markers",
  );
  assert.match(
    text,
    /(source of truth|sole source|sole truth|canonical truth)/i,
    "persistence-contract.md must state markers are the source of truth",
  );
});

test("persistence-contract.md states workspace.yaml is a regenerable cache trusted when valid", () => {
  const text = read(CONTRACT);
  assert.match(
    text,
    /openspec\/workspace\.yaml/,
    "persistence-contract.md must reference openspec/workspace.yaml",
  );
  assert.match(
    text,
    /regenerable|regenerated|regenerate/i,
    "persistence-contract.md must state the cache is regenerable",
  );
  assert.match(
    text,
    /(valid cache is trusted|trusted when valid|trusts? (a |the )?valid cache)/i,
    "persistence-contract.md must state a valid cache is trusted",
  );
});

test("persistence-contract.md states absent or corrupt cache triggers regeneration from markers", () => {
  const text = read(CONTRACT);
  assert.match(
    text,
    /(absent|missing)[\s\S]{0,80}?(corrupt|unparseable|invalid)/i,
    "persistence-contract.md must cover the absent/corrupt cache cases",
  );
  assert.match(
    text,
    /regenerat[\s\S]{0,60}?markers?/i,
    "persistence-contract.md must state regeneration is from member markers",
  );
});

test("persistence-contract.md documents git ls-files warn-on-detect when the cache is tracked", () => {
  const text = read(CONTRACT);
  assert.match(
    text,
    /git ls-files/i,
    "persistence-contract.md must mention the git ls-files warn-on-detect check",
  );
  assert.match(
    text,
    /warn[\s-]?on[\s-]?detect|emit[\s\S]{0,40}?warning/i,
    "persistence-contract.md must describe the warn-on-detect behavior",
  );
});

test("persistence-contract.md states C1 never runs a destructive git op automatically", () => {
  const text = read(CONTRACT);
  assert.match(
    text,
    /git rm --cached openspec\/workspace\.yaml/,
    "persistence-contract.md must show the manual git rm --cached remediation",
  );
  assert.match(
    text,
    /(never|MUST NOT|does not|do not)[\s\S]{0,120}?(destructive|automatic|automatically|git rm)/i,
    "persistence-contract.md must state C1 never runs a destructive git op automatically",
  );
});
