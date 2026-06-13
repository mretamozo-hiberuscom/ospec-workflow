"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  KNOWN_PHASES,
  KNOWN_GATES,
  KNOWN_CLASSES,
  KNOWN_COSTS,
  validateRoute,
  validateRouteTable,
  parseRoutingTable,
  classifyChange,
  matchConditions,
} = require("./route-dispatcher.js");

// ---------------------------------------------------------------------------
// Fixtures: the six canonical routes from design.md §The Six Routes
// ---------------------------------------------------------------------------

const FOUNDATION_ROUTE = {
  name: "foundation",
  classification: ["normal", "high-risk"],
  conditions: { "project.status": "empty" },
  phases: ["sdd-foundation"],
  gates: [],
  description: "Guided pre-SDD foundation phase for empty projects.",
};

const FEDERATED_ROUTE = {
  name: "federated",
  classification: ["normal", "high-risk"],
  conditions: { "artifact_store.backend": "workspace-federated" },
  phases: [
    "sdd-workspace",
    "sdd-propose",
    "sdd-spec",
    "sdd-design",
    "sdd-tasks",
    "sdd-apply",
    "sdd-verify",
    "sdd-archive",
  ],
  gates: ["impact", "clarify"],
  description: "Full SDD for federated multi-repo workspaces.",
};

const DEBUG_ROUTE = {
  name: "debug",
  classification: ["small", "normal"],
  conditions: { explicit_debug_intent: "true" },
  phases: ["sdd-explore", "sdd-apply"],
  gates: ["4r-review-gate"],
  description: "Lightweight locate-fix flow closing with 4R review gate.",
  cost: "low",
};

const BROWNFIELD_ROUTE = {
  name: "brownfield",
  classification: ["normal", "high-risk"],
  conditions: { "baseline.status": "pending" },
  phases: ["sdd-baseline"],
  gates: ["brownfield-advisory"],
  description: "Advisory-first baseline pass for brownfield repos.",
  cost: "medium",
};

const STANDARD_ROUTE = {
  name: "standard",
  classification: ["normal", "high-risk"],
  conditions: { "project.status": "active" },
  phases: [
    "sdd-propose",
    "sdd-spec",
    "sdd-design",
    "sdd-tasks",
    "sdd-apply",
    "sdd-verify",
    "sdd-archive",
  ],
  gates: ["clarify", "4r-review-gate"],
  description: "Full SDD for normal/high-risk changes on active projects.",
  cost: "high",
};

const LITE_ROUTE = {
  name: "lite",
  classification: ["trivial", "small"],
  conditions: { "change.classification": "small" },
  phases: ["sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify"],
  gates: [],
  description: "Reduced SDD for trivial/small changes.",
  cost: "low",
};

// ---------------------------------------------------------------------------
// KNOWN_* constant exports
// ---------------------------------------------------------------------------

test("KNOWN_PHASES includes all expected phase names", () => {
  const expected = [
    "sdd-foundation",
    "sdd-baseline",
    "sdd-workspace",
    "sdd-explore",
    "sdd-propose",
    "sdd-spec",
    "sdd-design",
    "sdd-tasks",
    "sdd-apply",
    "sdd-verify",
    "sdd-archive",
  ];

  for (const phase of expected) {
    assert.ok(
      KNOWN_PHASES.includes(phase),
      `KNOWN_PHASES should include '${phase}'`,
    );
  }
});

test("KNOWN_GATES includes all expected gate names", () => {
  const expected = [
    "clarify",
    "review-workload",
    "impact",
    "brownfield-advisory",
    "4r-review-gate",
  ];

  for (const gate of expected) {
    assert.ok(
      KNOWN_GATES.includes(gate),
      `KNOWN_GATES should include '${gate}'`,
    );
  }
});

test("KNOWN_CLASSES includes all four classification values", () => {
  assert.deepEqual(
    [...KNOWN_CLASSES].sort(),
    ["high-risk", "normal", "small", "trivial"],
  );
});

test("KNOWN_COSTS includes the three cost tiers", () => {
  assert.deepEqual([...KNOWN_COSTS].sort(), ["high", "low", "medium"]);
});

// ---------------------------------------------------------------------------
// validateRoute — six valid routes accepted
// ---------------------------------------------------------------------------

test("validateRoute accepts the foundation route", () => {
  const result = validateRoute(FOUNDATION_ROUTE);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRoute accepts the federated route", () => {
  const result = validateRoute(FEDERATED_ROUTE);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRoute accepts the debug route", () => {
  const result = validateRoute(DEBUG_ROUTE);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRoute accepts the brownfield route", () => {
  const result = validateRoute(BROWNFIELD_ROUTE);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRoute accepts the standard route", () => {
  const result = validateRoute(STANDARD_ROUTE);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRoute accepts the lite route", () => {
  const result = validateRoute(LITE_ROUTE);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

// ---------------------------------------------------------------------------
// validateRoute — optional fields accepted / tolerated
// ---------------------------------------------------------------------------

test("validateRoute accepts optional tags, experimental, and cost fields", () => {
  const entry = {
    ...STANDARD_ROUTE,
    tags: ["core"],
    experimental: false,
    cost: "high",
  };
  const result = validateRoute(entry);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRoute tolerates unknown fields for forward compatibility", () => {
  const entry = { ...STANDARD_ROUTE, future_flag: true, mystery_field: 42 };
  const result = validateRoute(entry);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

// ---------------------------------------------------------------------------
// validateRoute — rejection cases
// ---------------------------------------------------------------------------

test("validateRoute rejects entry missing the name field", () => {
  const { name: _name, ...entry } = STANDARD_ROUTE;
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0, "errors array must be non-empty");
  assert.ok(
    result.errors.some((e) => /name/i.test(e)),
    `errors should mention 'name'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateRoute rejects entry missing the classification field", () => {
  const { classification: _c, ...entry } = STANDARD_ROUTE;
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /classification/i.test(e)));
});

test("validateRoute rejects entry missing the conditions field", () => {
  const { conditions: _c, ...entry } = STANDARD_ROUTE;
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /conditions/i.test(e)));
});

test("validateRoute rejects entry missing the phases field", () => {
  const { phases: _p, ...entry } = STANDARD_ROUTE;
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /phases/i.test(e)));
});

test("validateRoute rejects entry missing the gates field", () => {
  const { gates: _g, ...entry } = STANDARD_ROUTE;
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /gates/i.test(e)));
});

test("validateRoute rejects entry missing the description field", () => {
  const { description: _d, ...entry } = STANDARD_ROUTE;
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /description/i.test(e)));
});

test("validateRoute rejects empty phases array", () => {
  const entry = { ...STANDARD_ROUTE, phases: [] };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /phases must not be empty/i.test(e)),
    `Expected 'phases must not be empty'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateRoute rejects unknown phase name", () => {
  const entry = { ...STANDARD_ROUTE, phases: ["sdd-spec", "nonexistent-phase"] };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /nonexistent-phase/i.test(e)),
    `Expected error naming 'nonexistent-phase'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateRoute rejects unknown gate name", () => {
  const entry = { ...STANDARD_ROUTE, gates: ["clarify", "ghost-gate"] };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /ghost-gate/i.test(e)),
    `Expected error naming 'ghost-gate'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateRoute rejects classification value not in KNOWN_CLASSES", () => {
  const entry = { ...STANDARD_ROUTE, classification: "mega-risky" };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /mega-risky/i.test(e) || /classification/i.test(e)),
  );
});

test("validateRoute rejects an array classification with an unknown value", () => {
  const entry = { ...STANDARD_ROUTE, classification: ["normal", "ultra-high"] };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /ultra-high/i.test(e)));
});

test("validateRoute rejects cost value not in KNOWN_COSTS", () => {
  const entry = { ...STANDARD_ROUTE, cost: "extreme" };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /extreme/i.test(e) || /cost/i.test(e)),
  );
});

test("validateRoute rejects non-boolean experimental value", () => {
  const entry = { ...STANDARD_ROUTE, experimental: "yes" };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /experimental/i.test(e)),
    `Expected error about experimental; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateRoute rejects non-string name (number)", () => {
  const entry = { ...STANDARD_ROUTE, name: 42 };
  const result = validateRoute(entry);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /name/i.test(e)),
    `Expected error naming 'name'; got: ${JSON.stringify(result.errors)}`,
  );
});

// ---------------------------------------------------------------------------
// validateRouteTable — duplicate name detection
// ---------------------------------------------------------------------------

test("validateRouteTable accepts a table of unique-named valid routes", () => {
  const result = validateRouteTable([FOUNDATION_ROUTE, STANDARD_ROUTE, LITE_ROUTE]);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateRouteTable rejects table with duplicate route names", () => {
  const duplicate = { ...STANDARD_ROUTE };
  const result = validateRouteTable([STANDARD_ROUTE, duplicate]);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /standard/i.test(e)),
    `Expected error naming duplicate 'standard'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateRouteTable reports per-entry errors alongside duplicate errors", () => {
  const badEntry = { ...STANDARD_ROUTE, phases: [] };
  const result = validateRouteTable([FOUNDATION_ROUTE, badEntry]);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => /phases must not be empty/i.test(e)));
});

// ---------------------------------------------------------------------------
// parseRoutingTable — subset round-trips
// ---------------------------------------------------------------------------

test("parseRoutingTable round-trips scalar fields", () => {
  const content = [
    "routing:",
    "  - name: lite",
    "    classification: small",
    "    conditions:",
    "      change.classification: small",
    "    phases: [sdd-propose, sdd-tasks, sdd-apply, sdd-verify]",
    "    gates: []",
    '    description: "Reduced SDD for trivial/small changes."',
    "    cost: low",
  ].join("\n");

  const routes = parseRoutingTable(content);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].name, "lite");
  assert.equal(routes[0].cost, "low");
  assert.equal(routes[0].description, "Reduced SDD for trivial/small changes.");
});

test("parseRoutingTable parses inline array phases", () => {
  const content = [
    "routing:",
    "  - name: lite",
    "    classification: small",
    "    conditions:",
    "      change.classification: small",
    "    phases: [sdd-propose, sdd-tasks, sdd-apply, sdd-verify]",
    "    gates: []",
    "    description: Reduced SDD.",
  ].join("\n");

  const routes = parseRoutingTable(content);

  assert.deepEqual(routes[0].phases, [
    "sdd-propose",
    "sdd-tasks",
    "sdd-apply",
    "sdd-verify",
  ]);
  assert.deepEqual(routes[0].gates, []);
});

test("parseRoutingTable parses block sequence phases", () => {
  const content = [
    "routing:",
    "  - name: standard",
    "    classification: normal",
    "    conditions:",
    "      project.status: active",
    "    phases:",
    "      - sdd-propose",
    "      - sdd-spec",
    "      - sdd-apply",
    "    gates: []",
    "    description: Standard SDD.",
  ].join("\n");

  const routes = parseRoutingTable(content);

  assert.deepEqual(routes[0].phases, ["sdd-propose", "sdd-spec", "sdd-apply"]);
});

test("parseRoutingTable parses nested conditions map", () => {
  const content = [
    "routing:",
    "  - name: foundation",
    "    classification: normal",
    "    conditions:",
    "      project.status: empty",
    "      architecture: none-detected",
    "    phases: [sdd-foundation]",
    "    gates: []",
    "    description: Foundation route.",
  ].join("\n");

  const routes = parseRoutingTable(content);

  assert.deepEqual(routes[0].conditions, {
    "project.status": "empty",
    "architecture": "none-detected",
  });
});

test("parseRoutingTable ignores comment lines and blank lines", () => {
  const content = [
    "# top-level comment",
    "routing:",
    "  # comment inside routing",
    "  - name: lite",
    "    classification: small",
    "",
    "    conditions:",
    "      # inline comment",
    "      change.classification: small",
    "    phases: [sdd-propose]",
    "    gates: []",
    "    description: Lite.",
  ].join("\n");

  const routes = parseRoutingTable(content);

  assert.equal(routes.length, 1);
  assert.equal(routes[0].name, "lite");
  assert.deepEqual(routes[0].conditions, { "change.classification": "small" });
});

test("parseRoutingTable parses multiple route entries", () => {
  const content = [
    "routing:",
    "  - name: foundation",
    "    classification: normal",
    "    conditions:",
    "      project.status: empty",
    "    phases: [sdd-foundation]",
    "    gates: []",
    "    description: Foundation.",
    "  - name: lite",
    "    classification: small",
    "    conditions:",
    "      change.classification: small",
    "    phases: [sdd-propose, sdd-tasks]",
    "    gates: []",
    "    description: Lite.",
  ].join("\n");

  const routes = parseRoutingTable(content);

  assert.equal(routes.length, 2);
  assert.equal(routes[0].name, "foundation");
  assert.equal(routes[1].name, "lite");
});

test("parseRoutingTable returns empty array when routing block is absent", () => {
  const routes = parseRoutingTable("schema: spec-driven\nstrict_tdd: true\n");

  assert.deepEqual(routes, []);
});

test("parseRoutingTable returns empty array for routing: []", () => {
  const routes = parseRoutingTable("schema: spec-driven\nrouting: []\n");

  assert.deepEqual(routes, []);
});

test("parseRoutingTable parses inline array classification", () => {
  const content = [
    "routing:",
    "  - name: standard",
    "    classification: [normal, high-risk]",
    "    conditions:",
    "      project.status: active",
    "    phases: [sdd-propose, sdd-apply]",
    "    gates: []",
    "    description: Standard.",
  ].join("\n");

  const routes = parseRoutingTable(content);

  assert.deepEqual(routes[0].classification, ["normal", "high-risk"]);
});

// ---------------------------------------------------------------------------
// classifyChange — deterministic vs advisory confidence
// ---------------------------------------------------------------------------

test("classifyChange returns deterministic confidence for explicit classification signal", () => {
  const result = classifyChange({ classification: "normal" });

  assert.equal(result.classification, "normal");
  assert.equal(result.confidence, "deterministic");
});

test("classifyChange returns deterministic confidence for project.status signal", () => {
  const result = classifyChange({ "project.status": "empty" });

  assert.equal(result.confidence, "deterministic");
});

test("classifyChange returns deterministic confidence for baseline.status signal", () => {
  const result = classifyChange({ "baseline.status": "pending" });

  assert.equal(result.confidence, "deterministic");
});

test("classifyChange returns deterministic confidence for artifact_store.backend signal", () => {
  const result = classifyChange({ "artifact_store.backend": "workspace-federated" });

  assert.equal(result.confidence, "deterministic");
});

test("classifyChange returns advisory confidence when no deterministic signal is present", () => {
  const result = classifyChange({ user_message: "add some logs" });

  assert.equal(result.confidence, "advisory");
});

test("classifyChange returns advisory confidence for empty context", () => {
  const result = classifyChange({});

  assert.equal(result.confidence, "advisory");
});

// ---------------------------------------------------------------------------
// Purity: no I/O or global mutation during any call
// ---------------------------------------------------------------------------

test("validateRoute executes without requiring fs or network (pure function)", () => {
  // A pure function call on an arbitrary object should not throw
  // and must not depend on filesystem state — confirmed by running
  // with a deliberately malformed entry that exercises all branches.
  const result = validateRoute({});

  // We don't assert valid here, but the call must complete without I/O error
  assert.ok(typeof result.valid === "boolean");
  assert.ok(Array.isArray(result.errors));
});

test("parseRoutingTable executes without filesystem access (pure string->object)", () => {
  // Passing arbitrary string content must never attempt a file read
  const routes = parseRoutingTable("not yaml at all\n");

  assert.ok(Array.isArray(routes));
});

test("classifyChange executes with arbitrary plain object (no I/O required)", () => {
  const result = classifyChange({ anything: "goes" });

  assert.ok(typeof result.confidence === "string");
});

// ---------------------------------------------------------------------------
// Phase 6 RED tests — matchConditions (6.1)
// ---------------------------------------------------------------------------

// (a) match: all default AND semantics
test("matchConditions AND mode — both keys match returns true", () => {
  const conditions = {
    "project.status": "active",
    "baseline.status": "pending",
  };
  assert.equal(matchConditions(conditions, { "project.status": "active", "baseline.status": "pending" }), true);
});

test("matchConditions AND mode — one key fails returns false", () => {
  const conditions = {
    "project.status": "active",
    "baseline.status": "pending",
  };
  assert.equal(matchConditions(conditions, { "project.status": "active", "baseline.status": "done" }), false);
});

// (b) match: any OR semantics
test("matchConditions OR mode — only one key matches returns true", () => {
  const conditions = {
    match: "any",
    "project.status": "empty",
    "baseline.status": "pending",
  };
  assert.equal(matchConditions(conditions, { "project.status": "empty" }), true);
});

test("matchConditions OR mode — no key matches returns false", () => {
  const conditions = {
    match: "any",
    "project.status": "empty",
    "baseline.status": "pending",
  };
  assert.equal(matchConditions(conditions, { "project.status": "active", "baseline.status": "done" }), false);
});

// (c) array-valued key ANY-of
test("matchConditions array value — ctx value equals first element returns true", () => {
  const conditions = { "baseline.status": ["pending", "partial"] };
  assert.equal(matchConditions(conditions, { "baseline.status": "pending" }), true);
});

test("matchConditions array value — ctx value equals second element returns true", () => {
  const conditions = { "baseline.status": ["pending", "partial"] };
  assert.equal(matchConditions(conditions, { "baseline.status": "partial" }), true);
});

test("matchConditions array value — ctx value not in array returns false", () => {
  const conditions = { "baseline.status": ["pending", "partial"] };
  assert.equal(matchConditions(conditions, { "baseline.status": "done" }), false);
});

// (d) derived boolean signal match
test("matchConditions derived boolean — true in conditions matches true in ctx", () => {
  const conditions = { specs_empty_with_code: true };
  assert.equal(matchConditions(conditions, { specs_empty_with_code: true }), true);
});

test("matchConditions derived boolean — true in conditions fails false in ctx", () => {
  const conditions = { specs_empty_with_code: true };
  assert.equal(matchConditions(conditions, { specs_empty_with_code: false }), false);
});

// (e) full brownfield trigger pattern
const BROWNFIELD_CONDITIONS = {
  match: "any",
  "baseline.status": ["pending", "partial"],
  specs_empty_with_code: true,
  code_without_specs: true,
};

test("matchConditions brownfield any — pending baseline matches", () => {
  assert.equal(matchConditions(BROWNFIELD_CONDITIONS, { "baseline.status": "pending" }), true);
});

test("matchConditions brownfield any — specs_empty_with_code true matches", () => {
  assert.equal(matchConditions(BROWNFIELD_CONDITIONS, { specs_empty_with_code: true }), true);
});

test("matchConditions brownfield any — code_without_specs true matches", () => {
  assert.equal(matchConditions(BROWNFIELD_CONDITIONS, { code_without_specs: true }), true);
});

// (f) done-baseline suppression
test("matchConditions brownfield any — done baseline with all signals false returns false", () => {
  assert.equal(
    matchConditions(BROWNFIELD_CONDITIONS, {
      "baseline.status": "done",
      specs_empty_with_code: false,
      code_without_specs: false,
    }),
    false,
  );
});

// (g) empty-conditions edge
test("matchConditions empty conditions match:all returns true (vacuously true)", () => {
  assert.equal(matchConditions({}, {}), true);
});

test("matchConditions empty conditions match:any returns false", () => {
  assert.equal(matchConditions({ match: "any" }, {}), false);
});

// (h) absent derived signal in ctx
test("matchConditions absent derived signal in ctx fails boolean check", () => {
  const conditions = { specs_empty_with_code: true };
  // ctx has no specs_empty_with_code key; undefined !== true → false
  assert.equal(matchConditions(conditions, {}), false);
});

// ---------------------------------------------------------------------------
// Phase 6 RED tests — validateRoute extended conditions (6.2)
// ---------------------------------------------------------------------------

// (a) accepts conditions with match: 'any' meta-key alongside real keys
test("validateRoute accepts conditions with match:any meta-key alongside real keys", () => {
  const entry = {
    ...STANDARD_ROUTE,
    conditions: {
      match: "any",
      "project.status": "empty",
      "baseline.status": "pending",
    },
  };
  const result = validateRoute(entry);
  assert.equal(result.valid, true, `expected valid; errors: ${JSON.stringify(result.errors)}`);
});

// (b) accepts array-valued condition key
test("validateRoute accepts array-valued condition key in conditions", () => {
  const entry = {
    ...STANDARD_ROUTE,
    conditions: {
      match: "any",
      "baseline.status": ["pending", "partial"],
    },
  };
  const result = validateRoute(entry);
  assert.equal(result.valid, true, `expected valid; errors: ${JSON.stringify(result.errors)}`);
});

// (c) accepts KNOWN_DERIVED_SIGNALS key with boolean value
test("validateRoute accepts KNOWN_DERIVED_SIGNALS key with boolean true value", () => {
  const entry = {
    ...STANDARD_ROUTE,
    conditions: {
      specs_empty_with_code: true,
    },
  };
  const result = validateRoute(entry);
  assert.equal(result.valid, true, `expected valid; errors: ${JSON.stringify(result.errors)}`);
});

// (d) rejects match value not in {all, any}
test("validateRoute rejects match value not in {all, any}", () => {
  const entry = {
    ...STANDARD_ROUTE,
    conditions: {
      match: "or",
      "project.status": "active",
    },
  };
  const result = validateRoute(entry);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /match/i.test(e)),
    `expected error about 'match'; got: ${JSON.stringify(result.errors)}`,
  );
});

// (e) rejects KNOWN_DERIVED_SIGNALS key with non-boolean value
test("validateRoute rejects KNOWN_DERIVED_SIGNALS key with non-boolean value", () => {
  const entry = {
    ...STANDARD_ROUTE,
    conditions: {
      specs_empty_with_code: "yes",
    },
  };
  const result = validateRoute(entry);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /specs_empty_with_code/i.test(e)),
    `expected error naming 'specs_empty_with_code'; got: ${JSON.stringify(result.errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Phase 6 RED tests — parseRoutingTable coercion (6.3)
// ---------------------------------------------------------------------------

// (a) conditions inline-array value round-trips to JS array
test("parseRoutingTable coerces conditions inline-array to JS array", () => {
  const content = [
    "routing:",
    "  - name: brownfield",
    "    classification: [normal, high-risk]",
    "    conditions:",
    "      baseline.status: [pending, partial]",
    "    phases: [sdd-baseline]",
    "    gates: [brownfield-advisory]",
    "    description: Brownfield.",
  ].join("\n");

  const routes = parseRoutingTable(content);
  assert.deepEqual(
    routes[0].conditions["baseline.status"],
    ["pending", "partial"],
    "baseline.status must be a JS array",
  );
});

// (b) condition value 'true' coerces to native boolean true
test("parseRoutingTable coerces condition 'true' string to boolean true", () => {
  const content = [
    "routing:",
    "  - name: brownfield",
    "    classification: normal",
    "    conditions:",
    "      specs_empty_with_code: true",
    "    phases: [sdd-baseline]",
    "    gates: []",
    "    description: Brownfield.",
  ].join("\n");

  const routes = parseRoutingTable(content);
  assert.equal(routes[0].conditions.specs_empty_with_code, true);
  assert.equal(typeof routes[0].conditions.specs_empty_with_code, "boolean");
});

// (c) condition value 'false' coerces to native boolean false
test("parseRoutingTable coerces condition 'false' string to boolean false", () => {
  const content = [
    "routing:",
    "  - name: brownfield",
    "    classification: normal",
    "    conditions:",
    "      code_without_specs: false",
    "    phases: [sdd-baseline]",
    "    gates: []",
    "    description: Brownfield.",
  ].join("\n");

  const routes = parseRoutingTable(content);
  assert.equal(routes[0].conditions.code_without_specs, false);
  assert.equal(typeof routes[0].conditions.code_without_specs, "boolean");
});

// (d) condition 'match: any' parses as string 'any' (NOT coerced to boolean)
test("parseRoutingTable parses match:any as string 'any' (not boolean)", () => {
  const content = [
    "routing:",
    "  - name: brownfield",
    "    classification: normal",
    "    conditions:",
    "      match: any",
    "      baseline.status: pending",
    "    phases: [sdd-baseline]",
    "    gates: []",
    "    description: Brownfield.",
  ].join("\n");

  const routes = parseRoutingTable(content);
  assert.equal(routes[0].conditions.match, "any");
  assert.equal(typeof routes[0].conditions.match, "string");
});

// (e) top-level experimental: true coerces to boolean true (W2 fix)
test("parseRoutingTable coerces top-level experimental:true string to boolean true", () => {
  const content = [
    "routing:",
    "  - name: debug",
    "    classification: small",
    "    conditions:",
    "      explicit_debug_intent: true",
    "    phases: [sdd-explore, sdd-apply]",
    "    gates: []",
    "    description: Debug.",
    "    experimental: true",
  ].join("\n");

  const routes = parseRoutingTable(content);
  assert.equal(routes[0].experimental, true);
  assert.equal(typeof routes[0].experimental, "boolean");
});

// (f) top-level experimental: false coerces to boolean false
test("parseRoutingTable coerces top-level experimental:false string to boolean false", () => {
  const content = [
    "routing:",
    "  - name: standard",
    "    classification: normal",
    "    conditions:",
    "      project.status: active",
    "    phases: [sdd-propose, sdd-apply]",
    "    gates: []",
    "    description: Standard.",
    "    experimental: false",
  ].join("\n");

  const routes = parseRoutingTable(content);
  assert.equal(routes[0].experimental, false);
  assert.equal(typeof routes[0].experimental, "boolean");
});
