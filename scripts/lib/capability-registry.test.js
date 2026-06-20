"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

// This import will throw MODULE_NOT_FOUND until Phase 2 creates the file.
const {
  parseCapabilities,
  capabilityNames,
  matchStackSkills,
} = require("./capability-registry.js");

// ---------------------------------------------------------------------------
// parseCapabilities
// ---------------------------------------------------------------------------

test("parseCapabilities: full block-sequence entry returns name/version/source", () => {
  const config = [
    "capabilities:",
    "  - name: angular",
    '    version: "17"',
    "    source: declared",
    "",
  ].join("\n");

  assert.deepEqual(parseCapabilities(config), [
    { name: "angular", version: "17", source: "declared" },
  ]);
});

test("parseCapabilities: name-only entry defaults source to declared and version to null", () => {
  const config = ["capabilities:", "  - name: postgres", ""].join("\n");

  assert.deepEqual(parseCapabilities(config), [
    { name: "postgres", version: null, source: "declared" },
  ]);
});

test("parseCapabilities: config with no capabilities key returns empty array", () => {
  assert.deepEqual(parseCapabilities("strict_tdd: true\n"), []);
});

test("parseCapabilities: inline empty list form capabilities: [] returns empty array", () => {
  assert.deepEqual(parseCapabilities("capabilities: []\n"), []);
});

test("parseCapabilities: two entries returned in declaration order", () => {
  const config = [
    "capabilities:",
    "  - name: angular",
    "  - name: postgres",
    "",
  ].join("\n");

  assert.deepEqual(parseCapabilities(config), [
    { name: "angular", version: null, source: "declared" },
    { name: "postgres", version: null, source: "declared" },
  ]);
});

// ---------------------------------------------------------------------------
// capabilityNames
// ---------------------------------------------------------------------------

test("capabilityNames: returns names in declaration order", () => {
  const entries = [
    { name: "angular", version: "17", source: "declared" },
    { name: "postgres", version: null, source: "declared" },
  ];

  assert.deepEqual(capabilityNames(entries), ["angular", "postgres"]);
});

test("capabilityNames: empty array returns empty array", () => {
  assert.deepEqual(capabilityNames([]), []);
});

// ---------------------------------------------------------------------------
// matchStackSkills
// ---------------------------------------------------------------------------

test("matchStackSkills: single name match returns that entry", () => {
  const entries = [
    { id: "stack-angular", capabilities: ["angular"], compact_rules: ["Use signals."] },
  ];

  assert.deepEqual(matchStackSkills(["angular"], entries), [entries[0]]);
});

test("matchStackSkills: two capability names return union of matched entries", () => {
  const angular = {
    id: "stack-angular",
    capabilities: ["angular"],
    compact_rules: [],
  };
  const postgres = {
    id: "stack-postgres",
    capabilities: ["postgres"],
    compact_rules: [],
  };
  const entries = [angular, postgres];

  const result = matchStackSkills(["angular", "postgres"], entries);

  assert.equal(result.length, 2);
  assert.ok(result.some((e) => e.id === "stack-angular"));
  assert.ok(result.some((e) => e.id === "stack-postgres"));
});

test("matchStackSkills: name matches no entry returns empty array", () => {
  const entries = [
    { id: "stack-angular", capabilities: ["angular"], compact_rules: [] },
  ];

  assert.deepEqual(matchStackSkills(["vue"], entries), []);
});

test("matchStackSkills: case-sensitive — Angular does not match angular capability", () => {
  const entries = [
    { id: "stack-angular", capabilities: ["angular"], compact_rules: [] },
  ];

  assert.deepEqual(matchStackSkills(["Angular"], entries), []);
});

test("matchStackSkills: two matched entries returned sorted by id ascending", () => {
  const dotnet = {
    id: "stack-dotnet",
    capabilities: ["dotnet"],
    compact_rules: [],
  };
  const angular = {
    id: "stack-angular",
    capabilities: ["angular"],
    compact_rules: [],
  };
  // Deliberately insert dotnet before angular to verify sort is applied.
  const entries = [dotnet, angular];

  const result = matchStackSkills(["angular", "dotnet"], entries);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, "stack-angular");
  assert.equal(result[1].id, "stack-dotnet");
});
