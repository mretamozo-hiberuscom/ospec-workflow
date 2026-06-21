"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  KNOWN_GATES,
  KNOWN_ON_FAIL,
  DEFAULT_GATE_TIMEOUT_MS,
  parseQualityGates,
  validateQualityGates,
  parseCoverage,
  classifyCoverage,
  classifyGate,
  enforceGate,
  aggregateStatus,
  buildAuditBlock,
} = require("./quality-gates.js");

// ---------------------------------------------------------------------------
// Task 1.2 — parseQualityGates
// ---------------------------------------------------------------------------

test("parseQualityGates: null input returns null", () => {
  assert.equal(parseQualityGates(null), null);
});

test("parseQualityGates: undefined input returns null", () => {
  assert.equal(parseQualityGates(undefined), null);
});

test("parseQualityGates: all four known gates recognized with defaults applied", () => {
  const raw = {
    tests: { command: "npm test" },
    lint: { command: "npm run lint" },
    architecture: {},
    security: {},
  };
  const result = parseQualityGates(raw);
  assert.ok(result !== null, "result must not be null");
  assert.ok("tests" in result, "tests gate must be present");
  assert.ok("lint" in result, "lint gate must be present");
  assert.ok("architecture" in result, "architecture gate must be present");
  assert.ok("security" in result, "security gate must be present");
  // defaults: required: false, on_fail: 'advisory'
  assert.equal(result.tests.required, false);
  assert.equal(result.tests.on_fail, "advisory");
  assert.equal(result.lint.required, false);
  assert.equal(result.lint.on_fail, "advisory");
});

test("parseQualityGates: unknown gate key dropped silently", () => {
  const raw = { tests: {}, unknown_gate: { command: "something" } };
  const result = parseQualityGates(raw);
  assert.ok(!("unknown_gate" in result), "unknown_gate must be absent from result");
  assert.ok("tests" in result, "tests must be present");
});

test("parseQualityGates: explicit on_fail: halt preserved", () => {
  const raw = { lint: { required: true, on_fail: "halt", command: "npm run lint" } };
  const result = parseQualityGates(raw);
  assert.equal(result.lint.on_fail, "halt");
  assert.equal(result.lint.required, true);
});

test("parseQualityGates: tests.coverage sub-object normalized", () => {
  const raw = {
    tests: {
      command: "npm test",
      coverage: { minimum: 80, command: "npm run coverage:pct" },
    },
  };
  const result = parseQualityGates(raw);
  assert.ok(result.tests.coverage, "coverage sub-object must be present");
  assert.equal(result.tests.coverage.minimum, 80);
  assert.equal(result.tests.coverage.command, "npm run coverage:pct");
});

// ---------------------------------------------------------------------------
// Task 1.3 — validateQualityGates
// ---------------------------------------------------------------------------

test("validateQualityGates: valid policy returns { valid: true, errors: [] }", () => {
  const policy = { tests: { required: false, on_fail: "advisory", command: "npm test" } };
  const { valid, errors } = validateQualityGates(policy);
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test("validateQualityGates: unknown on_fail value produces { valid: false, errors non-empty }", () => {
  const policy = { lint: { required: true, on_fail: "crash", command: "npm run lint" } };
  const { valid, errors } = validateQualityGates(policy);
  assert.equal(valid, false);
  assert.ok(errors.length > 0, "errors must be non-empty");
  assert.ok(
    errors.some((e) => /on_fail|crash/i.test(e)),
    `error must mention on_fail or the invalid value; got: ${JSON.stringify(errors)}`,
  );
});

test("validateQualityGates: calling with null MUST NOT throw", () => {
  assert.doesNotThrow(() => validateQualityGates(null));
});

test("validateQualityGates: calling with undefined MUST NOT throw", () => {
  assert.doesNotThrow(() => validateQualityGates(undefined));
});

test("validateQualityGates: calling with primitive 42 MUST NOT throw", () => {
  assert.doesNotThrow(() => validateQualityGates(42));
});

test("validateQualityGates: calling with string MUST NOT throw", () => {
  assert.doesNotThrow(() => validateQualityGates("string"));
});

// ---------------------------------------------------------------------------
// Task 1.4 — parseCoverage
// ---------------------------------------------------------------------------

test("parseCoverage: '85' → 85", () => {
  assert.equal(parseCoverage("85"), 85);
});

test("parseCoverage: '72.4' → 72.4", () => {
  assert.equal(parseCoverage("72.4"), 72.4);
});

test("parseCoverage: empty string → null", () => {
  assert.equal(parseCoverage(""), null);
});

test("parseCoverage: 'not a number' → null", () => {
  assert.equal(parseCoverage("not a number"), null);
});

test("parseCoverage: null input → null", () => {
  assert.equal(parseCoverage(null), null);
});

// ---------------------------------------------------------------------------
// Task 1.5 — classifyGate
// ---------------------------------------------------------------------------

test("classifyGate: absent command → { status: 'skipped', detail: 'command not configured' }", () => {
  const result = classifyGate("lint", {}, { exitCode: 0 });
  assert.equal(result.status, "skipped");
  assert.ok(result.detail, "detail must be present for skipped gate");
  assert.match(result.detail, /command not configured/i);
});

test("classifyGate: empty command string → { status: 'skipped', ... }", () => {
  const result = classifyGate("lint", { command: "" }, { exitCode: 0 });
  assert.equal(result.status, "skipped");
  assert.ok(result.detail, "detail must be present");
});

test("classifyGate: exitCode 0 → { status: 'pass' }", () => {
  const result = classifyGate("lint", { command: "npm run lint" }, { exitCode: 0 });
  assert.equal(result.status, "pass");
});

test("classifyGate: exitCode 1 → { status: 'fail' }", () => {
  const result = classifyGate("lint", { command: "npm run lint" }, { exitCode: 1 });
  assert.equal(result.status, "fail");
});

test("classifyGate: tests gate coverage below minimum → { status: 'fail', detail mentioning coverage pct and minimum }", () => {
  const cfg = {
    command: "npm test",
    coverage: { minimum: 80, command: "npm run coverage:pct" },
  };
  const result = classifyGate("tests", cfg, { exitCode: 0, coverageStdout: "72" });
  assert.equal(result.status, "fail");
  assert.ok(result.detail, "detail must be present");
  assert.match(result.detail, /72%/);
  assert.match(result.detail, /80%/);
});

test("classifyGate: tests gate with absent coverage.command → status pass with coverage-skipped warning detail", () => {
  const cfg = { command: "npm test", coverage: { minimum: 80 } };
  const result = classifyGate("tests", cfg, { exitCode: 0 });
  assert.equal(result.status, "pass", "gate must NOT be failed due to absent coverage command");
  assert.ok(result.detail, "detail must be present as coverage-skipped warning");
  assert.match(result.detail, /coverage/i);
  assert.match(result.detail, /skip/i);
});

test("classifyGate: tests gate, un-parseable coverageStdout → coverage skipped-with-warning, not fail", () => {
  const cfg = {
    command: "npm test",
    coverage: { minimum: 80, command: "npm run coverage:pct" },
  };
  const result = classifyGate("tests", cfg, { exitCode: 0, coverageStdout: "not-a-number" });
  assert.notEqual(result.status, "fail", "gate must NOT be failed on un-parseable coverage");
  assert.ok(result.detail, "detail must mention coverage skip");
  assert.match(result.detail, /coverage/i);
  assert.match(result.detail, /skip/i);
});

// ---------------------------------------------------------------------------
// Task 1.6 — enforceGate
// ---------------------------------------------------------------------------

test("enforceGate: required:true, on_fail:'halt', status:'fail' → { finding: 'BLOCKER', blocksArchive: true }", () => {
  const cfg = { required: true, on_fail: "halt" };
  const result = enforceGate("lint", cfg, { status: "fail" });
  assert.equal(result.finding, "BLOCKER");
  assert.equal(result.blocksArchive, true);
});

test("enforceGate: required:true, on_fail:'advisory', status:'fail' → { finding: 'WARNING', blocksArchive: false }", () => {
  const cfg = { required: true, on_fail: "advisory" };
  const result = enforceGate("security", cfg, { status: "fail" });
  assert.equal(result.finding, "WARNING");
  assert.equal(result.blocksArchive, false);
});

test("enforceGate: required:false, status:'fail' → { finding: null, blocksArchive: false }", () => {
  const cfg = { required: false, on_fail: "advisory" };
  const result = enforceGate("architecture", cfg, { status: "fail" });
  assert.equal(result.finding, null);
  assert.equal(result.blocksArchive, false);
});

test("enforceGate: status:'pass' → { finding: null, blocksArchive: false }", () => {
  const cfg = { required: true, on_fail: "halt" };
  const result = enforceGate("lint", cfg, { status: "pass" });
  assert.equal(result.finding, null);
  assert.equal(result.blocksArchive, false);
});

test("enforceGate: status:'skipped' → { finding: null, blocksArchive: false }", () => {
  const cfg = { required: true, on_fail: "halt" };
  const result = enforceGate("lint", cfg, { status: "skipped" });
  assert.equal(result.finding, null);
  assert.equal(result.blocksArchive, false);
});

// ---------------------------------------------------------------------------
// Task 1.7 — aggregateStatus
// ---------------------------------------------------------------------------

test("aggregateStatus: one gate fail with required:true, on_fail:'halt' → 'fail'", () => {
  const gates = [{ name: "lint", status: "fail", required: true, on_fail: "halt" }];
  assert.equal(aggregateStatus(gates), "fail");
});

test("aggregateStatus: one fail advisory, one pass → 'pass'", () => {
  const gates = [
    { name: "security", status: "fail", required: true, on_fail: "advisory" },
    { name: "lint", status: "pass", required: true, on_fail: "halt" },
  ];
  assert.equal(aggregateStatus(gates), "pass");
});

test("aggregateStatus: all gates skipped → 'skipped'", () => {
  const gates = [
    { name: "lint", status: "skipped", required: false, on_fail: "advisory" },
    { name: "security", status: "skipped", required: false, on_fail: "advisory" },
  ];
  assert.equal(aggregateStatus(gates), "skipped");
});

test("aggregateStatus: mix of pass and skipped, no fail → 'pass'", () => {
  const gates = [
    { name: "lint", status: "pass", required: true, on_fail: "halt" },
    { name: "architecture", status: "skipped", required: false, on_fail: "advisory" },
  ];
  assert.equal(aggregateStatus(gates), "pass");
});

// ---------------------------------------------------------------------------
// Task 1.8 — buildAuditBlock
// ---------------------------------------------------------------------------

test("buildAuditBlock: output has top-level status, evaluated_at, gates keys", () => {
  const results = [{ name: "lint", status: "pass", required: true, on_fail: "halt" }];
  const block = buildAuditBlock(results, "2026-06-21T00:00:00Z");
  assert.ok("status" in block, "status key must be present");
  assert.ok("evaluated_at" in block, "evaluated_at key must be present");
  assert.ok("gates" in block, "gates key must be present");
  assert.equal(block.evaluated_at, "2026-06-21T00:00:00Z");
});

test("buildAuditBlock: each gate entry has status, required, on_fail", () => {
  const results = [{ name: "lint", status: "fail", required: true, on_fail: "halt" }];
  const block = buildAuditBlock(results, "2026-06-21T00:00:00Z");
  const lintEntry = block.gates.lint;
  assert.ok(lintEntry, "lint gate entry must be present");
  assert.ok("status" in lintEntry, "status key must be present in gate entry");
  assert.ok("required" in lintEntry, "required key must be present in gate entry");
  assert.ok("on_fail" in lintEntry, "on_fail key must be present in gate entry");
  assert.equal(lintEntry.status, "fail");
  assert.equal(lintEntry.required, true);
  assert.equal(lintEntry.on_fail, "halt");
});

test("buildAuditBlock: detail key present only when informative", () => {
  const results = [
    { name: "lint", status: "pass", required: true, on_fail: "halt" },
    {
      name: "architecture",
      status: "skipped",
      required: false,
      on_fail: "advisory",
      detail: "command not configured",
    },
  ];
  const block = buildAuditBlock(results, "2026-06-21T00:00:00Z");
  assert.ok(
    !("detail" in block.gates.lint),
    "detail must NOT be present in gate entry when not informative",
  );
  assert.equal(block.gates.architecture.detail, "command not configured");
});

test("buildAuditBlock: top-level status matches aggregateStatus result for halt-fail", () => {
  const results = [{ name: "lint", status: "fail", required: true, on_fail: "halt" }];
  const block = buildAuditBlock(results, "2026-06-21T00:00:00Z");
  assert.equal(block.status, "fail");
});

test("buildAuditBlock: top-level status is 'pass' when no halt-required fail present", () => {
  const results = [
    { name: "lint", status: "pass", required: true, on_fail: "halt" },
    { name: "security", status: "fail", required: true, on_fail: "advisory" },
  ];
  const block = buildAuditBlock(results, "2026-06-21T00:00:00Z");
  assert.equal(block.status, "pass");
});

// ---------------------------------------------------------------------------
// Constants exports — smoke tests that the named exports exist and are correct
// ---------------------------------------------------------------------------

test("KNOWN_GATES contains all four gate names", () => {
  const expected = ["tests", "lint", "architecture", "security"];
  for (const g of expected) {
    assert.ok(
      KNOWN_GATES.includes(g),
      `KNOWN_GATES should include '${g}'`,
    );
  }
  assert.equal(KNOWN_GATES.length, 4, "KNOWN_GATES must have exactly 4 entries");
});

test("KNOWN_ON_FAIL contains advisory and halt", () => {
  assert.deepEqual([...KNOWN_ON_FAIL].sort(), ["advisory", "halt"]);
});

// ===========================================================================
// 4R remediation (cycle 4r-critical-1) — failing-first tests for H4/H5/H6
// ===========================================================================

// ---------------------------------------------------------------------------
// H5 — DEFAULT_GATE_TIMEOUT_MS constant + timeout_ms parsing/validation
// ---------------------------------------------------------------------------

test("H5: DEFAULT_GATE_TIMEOUT_MS is a positive integer (120000)", () => {
  assert.equal(DEFAULT_GATE_TIMEOUT_MS, 120000);
});

test("H5: parseQualityGates applies default timeout_ms when absent", () => {
  const out = parseQualityGates({ tests: { command: "npm test" } });
  assert.equal(out.tests.timeout_ms, DEFAULT_GATE_TIMEOUT_MS);
});

test("H5: parseQualityGates preserves a valid positive integer timeout_ms", () => {
  const out = parseQualityGates({ lint: { command: "lint", timeout_ms: 30000 } });
  assert.equal(out.lint.timeout_ms, 30000);
});

test("H5: parseQualityGates falls back to default for non-positive timeout_ms", () => {
  const zero = parseQualityGates({ lint: { command: "lint", timeout_ms: 0 } });
  assert.equal(zero.lint.timeout_ms, DEFAULT_GATE_TIMEOUT_MS);
  const neg = parseQualityGates({ lint: { command: "lint", timeout_ms: -5 } });
  assert.equal(neg.lint.timeout_ms, DEFAULT_GATE_TIMEOUT_MS);
});

test("H5: parseQualityGates falls back to default for non-integer/non-numeric timeout_ms", () => {
  const str = parseQualityGates({ lint: { command: "lint", timeout_ms: "fast" } });
  assert.equal(str.lint.timeout_ms, DEFAULT_GATE_TIMEOUT_MS);
  const frac = parseQualityGates({ lint: { command: "lint", timeout_ms: 1.5 } });
  assert.equal(frac.lint.timeout_ms, DEFAULT_GATE_TIMEOUT_MS);
});

test("H5: validateQualityGates flags a present but non-positive timeout_ms", () => {
  const { valid, errors } = validateQualityGates({ lint: { timeout_ms: -1 } });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /timeout_ms/i.test(e)));
});

// ---------------------------------------------------------------------------
// H6 — coverage.minimum coercion/range validation; parseCoverage range
// ---------------------------------------------------------------------------

test("H6: parseQualityGates coerces a numeric-string minimum to a number", () => {
  const out = parseQualityGates({ tests: { coverage: { minimum: "80" } } });
  assert.strictEqual(out.tests.coverage.minimum, 80);
});

test("H6: parseQualityGates omits an invalid (non-numeric) minimum", () => {
  const out = parseQualityGates({ tests: { coverage: { minimum: "80%", command: "cov" } } });
  assert.equal(out.tests.coverage.minimum, undefined);
  // command still preserved
  assert.equal(out.tests.coverage.command, "cov");
});

test("H6: parseQualityGates omits an out-of-range minimum (<0 or >100)", () => {
  const lo = parseQualityGates({ tests: { coverage: { minimum: -1 } } });
  assert.equal(lo.tests.coverage.minimum, undefined);
  const hi = parseQualityGates({ tests: { coverage: { minimum: 101 } } });
  assert.equal(hi.tests.coverage.minimum, undefined);
});

test("H6: validateQualityGates flags a present but invalid coverage.minimum", () => {
  const { valid, errors } = validateQualityGates({ tests: { coverage: { minimum: "80%" } } });
  assert.equal(valid, false);
  assert.ok(errors.some((e) => /minimum/i.test(e)));
});

test("H6: parseCoverage returns null for out-of-range values (no clamp)", () => {
  assert.equal(parseCoverage("150"), null);
  assert.equal(parseCoverage("-5"), null);
});

test("H6: parseCoverage accepts boundary values 0 and 100 and fractional in-range", () => {
  assert.equal(parseCoverage("0"), 0);
  assert.equal(parseCoverage("100"), 100);
  assert.equal(parseCoverage("79.5"), 79.5);
});

test("H6: parseCoverage(undefined) → null", () => {
  assert.equal(parseCoverage(undefined), null);
});

// ---------------------------------------------------------------------------
// Defensive parsing — malformed parseQualityGates inputs (never throw)
// ---------------------------------------------------------------------------

test("parseQualityGates: malformed top-level inputs return null", () => {
  assert.equal(parseQualityGates([]), null);
  assert.equal(parseQualityGates("nope"), null);
  assert.equal(parseQualityGates(42), null);
  assert.equal(parseQualityGates(null), null);
});

test("parseQualityGates: a non-object gate value normalizes to safe defaults", () => {
  const out = parseQualityGates({ lint: "true" });
  assert.equal(out.lint.required, false);
  assert.equal(out.lint.on_fail, "advisory");
});

// ---------------------------------------------------------------------------
// H4 — distinct `error` classification (tool failure / timeout / NaN exit)
// ---------------------------------------------------------------------------

test("H4: classifyGate with execResult.timedOut → status 'error' with timeout detail", () => {
  const r = classifyGate("lint", { command: "lint", timeout_ms: 5000 }, { timedOut: true });
  assert.equal(r.status, "error");
  assert.match(r.detail, /timed out/i);
});

test("H4: classifyGate with execResult.error → status 'error'", () => {
  const r = classifyGate("lint", { command: "lint" }, { error: new Error("ENOENT") });
  assert.equal(r.status, "error");
  assert.match(r.detail, /failed to execute/i);
});

test("H4: classifyGate with non-finite exitCode (undefined/NaN) → status 'error'", () => {
  const u = classifyGate("lint", { command: "lint" }, {});
  assert.equal(u.status, "error");
  const n = classifyGate("lint", { command: "lint" }, { exitCode: NaN });
  assert.equal(n.status, "error");
});

test("H4: classifyGate timedOut takes precedence over an exit code", () => {
  const r = classifyGate("lint", { command: "lint" }, { timedOut: true, exitCode: 0 });
  assert.equal(r.status, "error");
});

test("H4: enforceGate treats required-halt 'error' as BLOCKER + blocksArchive", () => {
  const r = enforceGate("lint", { required: true, on_fail: "halt" }, { status: "error" });
  assert.deepEqual(r, { finding: "BLOCKER", blocksArchive: true });
});

test("H4: enforceGate treats required-advisory 'error' as WARNING", () => {
  const r = enforceGate("lint", { required: true, on_fail: "advisory" }, { status: "error" });
  assert.deepEqual(r, { finding: "WARNING", blocksArchive: false });
});

test("H4: aggregateStatus treats a required-halt 'error' as top-level 'fail'", () => {
  const out = aggregateStatus([
    { name: "lint", status: "error", required: true, on_fail: "halt" },
  ]);
  assert.equal(out, "fail");
});

test("H4: buildAuditBlock preserves a per-gate 'error' status distinctly", () => {
  const block = buildAuditBlock(
    [{ name: "lint", status: "error", required: true, on_fail: "halt", detail: "timed out" }],
    "2026-06-21T00:00:00Z",
  );
  assert.equal(block.gates.lint.status, "error");
  assert.equal(block.status, "fail");
});

// ---------------------------------------------------------------------------
// H4/readability — classifyCoverage pure helper in isolation
// ---------------------------------------------------------------------------

test("classifyCoverage: below minimum → { override: 'fail', detail }", () => {
  const r = classifyCoverage(
    { coverage: { minimum: 80, command: "cov" } },
    { coverageStdout: "72" },
  );
  assert.equal(r.override, "fail");
  assert.match(r.detail, /72.*80/);
});

test("classifyCoverage: no coverage.command → skipped with warning, no override", () => {
  const r = classifyCoverage({ coverage: { minimum: 80 } }, { coverageStdout: "72" });
  assert.equal(r.override, undefined);
  assert.match(r.detail, /skipped/i);
});

test("classifyCoverage: un-parseable / out-of-range stdout → skipped warning, no override", () => {
  const bad = classifyCoverage(
    { coverage: { minimum: 80, command: "cov" } },
    { coverageStdout: "n/a" },
  );
  assert.equal(bad.override, undefined);
  assert.match(bad.detail, /skipped/i);
  const oor = classifyCoverage(
    { coverage: { minimum: 80, command: "cov" } },
    { coverageStdout: "150" },
  );
  assert.equal(oor.override, undefined);
});

test("classifyCoverage: omitted minimum → no override, no detail", () => {
  const r = classifyCoverage({ coverage: { command: "cov" } }, { coverageStdout: "72" });
  assert.equal(r.override, undefined);
  assert.equal(r.detail, undefined);
});

// ---------------------------------------------------------------------------
// aggregateStatus / buildAuditBlock — empty-array contract
// ---------------------------------------------------------------------------

test("aggregateStatus([]) → 'skipped'", () => {
  assert.equal(aggregateStatus([]), "skipped");
});

test("buildAuditBlock([], ts) → { status: 'skipped', evaluated_at: ts, gates: {} }", () => {
  const ts = "2026-06-21T00:00:00Z";
  assert.deepEqual(buildAuditBlock([], ts), {
    status: "skipped",
    evaluated_at: ts,
    gates: {},
  });
});
