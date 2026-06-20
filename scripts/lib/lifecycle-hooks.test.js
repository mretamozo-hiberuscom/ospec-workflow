"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

// Importing from a file that does not exist yet — every test in this suite
// will fail at load time with MODULE_NOT_FOUND until Phase 2 is implemented.
const {
  KNOWN_EVENTS,
  KNOWN_ACTION_TYPES,
  KNOWN_POLICIES,
  parseHooksBlock,
  validateHooksBlock,
  eventAppliesToRoute,
  planExecution,
  computeEventStatus,
  buildAuditEntry,
} = require("./lifecycle-hooks.js");

// ---------------------------------------------------------------------------
// Task 1.2 — parseHooksBlock
// ---------------------------------------------------------------------------

test("parseHooksBlock: absent/null content returns empty object", () => {
  assert.deepEqual(parseHooksBlock(null), {});
});

test("parseHooksBlock: undefined content returns empty object", () => {
  assert.deepEqual(parseHooksBlock(undefined), {});
});

test("parseHooksBlock: valid object with two known events returns parsed map", () => {
  const raw = {
    "before-change": [
      { type: "load-skill", skill: "skills/sec/SKILL.md", on_failure: "advisory" },
    ],
    "before-verify": [
      { type: "run-command", command: "npm run preflight", on_failure: "halt" },
    ],
  };
  const result = parseHooksBlock(raw);
  assert.ok("before-change" in result, "before-change should be present");
  assert.ok("before-verify" in result, "before-verify should be present");
  assert.equal(Object.keys(result).length, 2);
});

test("parseHooksBlock: unknown event key is absent from result", () => {
  const raw = {
    "before-change": [{ type: "load-skill", skill: "x.md" }],
    "unknown-phase": [{ type: "run-command", command: "ls" }],
  };
  const result = parseHooksBlock(raw);
  assert.ok("before-change" in result, "before-change should be present");
  assert.ok(!("unknown-phase" in result), "unknown-phase must be absent");
});

test("parseHooksBlock: action object fields are preserved (type, skill, on_failure)", () => {
  const action = { type: "load-skill", skill: "skills/sec/SKILL.md", on_failure: "advisory" };
  const result = parseHooksBlock({ "before-change": [action] });
  const parsed = result["before-change"][0];
  assert.equal(parsed.type, "load-skill");
  assert.equal(parsed.skill, "skills/sec/SKILL.md");
  assert.equal(parsed.on_failure, "advisory");
});

test("parseHooksBlock: rules and command fields are preserved", () => {
  const raw = {
    "before-verify": [{ type: "load-rules", rules: "Coverage >= 80%", on_failure: "advisory" }],
    "before-commit": [{ type: "run-command", command: "npm run lint", on_failure: "halt" }],
  };
  const result = parseHooksBlock(raw);
  assert.equal(result["before-verify"][0].rules, "Coverage >= 80%");
  assert.equal(result["before-commit"][0].command, "npm run lint");
});

// ---------------------------------------------------------------------------
// Task 1.3 — validateHooksBlock
// ---------------------------------------------------------------------------

test("validateHooksBlock: action missing type field produces error", () => {
  const hooks = {
    "before-change": [{ skill: "x.md", on_failure: "advisory" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(errors.length > 0, "errors must be non-empty");
  assert.ok(
    errors.some((e) => /type/i.test(e)),
    `errors should mention 'type'; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: load-skill action missing skill field produces error", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", on_failure: "advisory" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /skill/i.test(e)),
    `errors should mention 'skill'; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: load-rules action missing rules field produces error", () => {
  const hooks = {
    "before-verify": [{ type: "load-rules", on_failure: "advisory" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /rules/i.test(e)),
    `errors should mention 'rules'; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: run-command action missing command field produces error", () => {
  const hooks = {
    "before-commit": [{ type: "run-command", on_failure: "halt" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /command/i.test(e)),
    `errors should mention 'command'; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: invalid on_failure value produces error", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", skill: "x.md", on_failure: "ignore" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /on_failure/i.test(e) || /ignore/i.test(e)),
    `errors should mention 'on_failure' or 'ignore'; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: well-formed block returns {valid: true, errors: []}", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", skill: "skills/sec/SKILL.md", on_failure: "advisory" }],
    "before-verify": [{ type: "load-rules", rules: "Coverage >= 80%", on_failure: "advisory" }],
    "before-commit": [{ type: "run-command", command: "npm run lint", on_failure: "halt" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, true);
  assert.deepEqual(errors, []);
});

test("validateHooksBlock: action without on_failure field (optional) is valid", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", skill: "skills/x.md" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, true, `expected valid; errors: ${JSON.stringify(errors)}`);
});

// ---------------------------------------------------------------------------
// Task 1.4 — eventAppliesToRoute
// ---------------------------------------------------------------------------

test("eventAppliesToRoute: event present in routePhases mapping returns true", () => {
  // before-change always applies
  assert.equal(eventAppliesToRoute("before-change", ["sdd-propose"]), true);
});

test("eventAppliesToRoute: before-verify when route is [sdd-apply] returns false", () => {
  assert.equal(eventAppliesToRoute("before-verify", ["sdd-apply"]), false);
});

test("eventAppliesToRoute: before-implementation when sdd-apply is in phases returns true", () => {
  assert.equal(
    eventAppliesToRoute("before-implementation", ["sdd-propose", "sdd-spec", "sdd-apply", "sdd-verify"]),
    true,
  );
});

test("eventAppliesToRoute: before-task requires sdd-apply in phases", () => {
  assert.equal(eventAppliesToRoute("before-task", ["sdd-apply"]), true);
  assert.equal(eventAppliesToRoute("before-task", ["sdd-verify"]), false);
});

test("eventAppliesToRoute: before-commit requires sdd-apply in phases", () => {
  assert.equal(eventAppliesToRoute("before-commit", ["sdd-apply", "sdd-verify"]), true);
  assert.equal(eventAppliesToRoute("before-commit", ["sdd-verify"]), false);
});

test("eventAppliesToRoute: after-verify requires sdd-verify in phases", () => {
  assert.equal(eventAppliesToRoute("after-verify", ["sdd-verify", "sdd-archive"]), true);
  assert.equal(eventAppliesToRoute("after-verify", ["sdd-apply"]), false);
});

test("eventAppliesToRoute: after-archive requires sdd-archive in phases", () => {
  assert.equal(eventAppliesToRoute("after-archive", ["sdd-archive"]), true);
  assert.equal(eventAppliesToRoute("after-archive", ["sdd-verify"]), false);
});

test("eventAppliesToRoute: before-change applies to any route (always-true)", () => {
  assert.equal(eventAppliesToRoute("before-change", []), true);
  assert.equal(eventAppliesToRoute("before-change", ["sdd-verify"]), true);
});

// ---------------------------------------------------------------------------
// Task 1.5 — planExecution
// ---------------------------------------------------------------------------

test("planExecution: three actions returned in original order A, B, C", () => {
  const actions = [
    { type: "load-skill", skill: "a.md", on_failure: "advisory" },
    { type: "run-command", command: "npm test", on_failure: "halt" },
    { type: "load-rules", rules: "Do X.", on_failure: "advisory" },
  ];
  const result = planExecution(actions);
  assert.equal(result.length, 3);
  assert.equal(result[0].type, "load-skill");
  assert.equal(result[1].type, "run-command");
  assert.equal(result[2].type, "load-rules");
});

test("planExecution: halt action with outcome failed marks subsequent entries as skipped", () => {
  // B has on_failure: halt and outcome: failed → C must get outcome: skipped
  const actions = [
    { type: "load-skill", skill: "a.md", on_failure: "advisory", outcome: "success" },
    { type: "run-command", command: "npm test", on_failure: "halt", outcome: "failed" },
    { type: "load-rules", rules: "Do X.", on_failure: "advisory" },
  ];
  const result = planExecution(actions);
  assert.equal(result[2].outcome, "skipped",
    "C must have outcome skipped after halt failure on B");
});

test("planExecution: advisory failure on B does not cause C to be skipped", () => {
  const actions = [
    { type: "load-skill", skill: "a.md", on_failure: "advisory", outcome: "success" },
    { type: "run-command", command: "npm test", on_failure: "advisory", outcome: "failed" },
    { type: "load-rules", rules: "Do X.", on_failure: "advisory", outcome: "success" },
  ];
  const result = planExecution(actions);
  assert.notEqual(result[2].outcome, "skipped",
    "C must NOT be skipped when B has on_failure: advisory");
  assert.equal(result[2].outcome, "success");
});

test("planExecution: does not mutate original actions (input-immutability proof)", () => {
  const actions = Object.freeze([
    Object.freeze({ type: "run-command", command: "x", on_failure: "halt", outcome: "failed" }),
    Object.freeze({ type: "load-rules", rules: "y", on_failure: "advisory" }),
  ]);
  assert.doesNotThrow(() => planExecution(actions));
  // Original second action must not have been mutated
  assert.equal(actions[1].outcome, undefined);
});

// ---------------------------------------------------------------------------
// Task 1.6 — computeEventStatus
// ---------------------------------------------------------------------------

test("computeEventStatus: all success outcomes returns 'done'", () => {
  const outcomes = [
    { outcome: "success", policy: "advisory" },
    { outcome: "success", policy: "advisory" },
  ];
  assert.equal(computeEventStatus(outcomes), "done");
});

test("computeEventStatus: one halt action failed returns 'failed'", () => {
  const outcomes = [
    { outcome: "success", policy: "advisory" },
    { outcome: "failed", policy: "halt" },
    { outcome: "skipped", policy: "advisory" },
  ];
  assert.equal(computeEventStatus(outcomes), "failed");
});

test("computeEventStatus: one advisory action failed, rest success returns 'done'", () => {
  const outcomes = [
    { outcome: "success", policy: "advisory" },
    { outcome: "failed", policy: "advisory" },
    { outcome: "success", policy: "advisory" },
  ];
  assert.equal(computeEventStatus(outcomes), "done");
});

test("computeEventStatus: all skipped outcomes returns 'skipped'", () => {
  const outcomes = [
    { outcome: "skipped", policy: "advisory" },
    { outcome: "skipped", policy: "halt" },
  ];
  assert.equal(computeEventStatus(outcomes), "skipped");
});

test("computeEventStatus: empty action outcomes returns 'skipped' (vacuous)", () => {
  assert.equal(computeEventStatus([]), "skipped");
});

test("computeEventStatus: halt failure takes precedence over all-skipped check", () => {
  // Only one action, failed with halt (non-skipped outcome)
  const outcomes = [{ outcome: "failed", policy: "halt" }];
  assert.equal(computeEventStatus(outcomes), "failed");
});

// ---------------------------------------------------------------------------
// Task 1.7 — buildAuditEntry for single-fire events
// ---------------------------------------------------------------------------

test("buildAuditEntry: before-change with one success action has correct shape", () => {
  const results = [
    { type: "load-skill", skill: "skills/sec/SKILL.md", on_failure: "advisory", outcome: "success" },
  ];
  const entry = buildAuditEntry("before-change", results);
  assert.equal(entry.status, "done");
  assert.ok(Array.isArray(entry.actions), "actions must be an array");
  assert.equal(entry.actions.length, 1);
  assert.equal(entry.actions[0].outcome, "success");
  assert.equal(entry.actions[0].policy, "advisory");
});

test("buildAuditEntry: skipped event (null results) returns {status: skipped, actions: []}", () => {
  const entry = buildAuditEntry("before-change", null);
  assert.equal(entry.status, "skipped");
  assert.deepEqual(entry.actions, []);
});

test("buildAuditEntry: single-fire event includes action type and type-specific fields", () => {
  const results = [
    { type: "load-skill", skill: "skills/sec/SKILL.md", on_failure: "advisory", outcome: "success" },
  ];
  const entry = buildAuditEntry("before-change", results);
  assert.equal(entry.actions[0].type, "load-skill");
  assert.equal(entry.actions[0].skill, "skills/sec/SKILL.md");
});

test("buildAuditEntry: run-command result includes command field and message when present", () => {
  const results = [
    { type: "run-command", command: "npm run preflight", on_failure: "halt", outcome: "failed", message: "exit code 1" },
  ];
  const entry = buildAuditEntry("before-verify", results);
  assert.equal(entry.status, "failed");
  assert.equal(entry.actions[0].command, "npm run preflight");
  assert.equal(entry.actions[0].policy, "halt");
  assert.equal(entry.actions[0].message, "exit code 1");
});

test("buildAuditEntry: maps on_failure to policy in single-fire output", () => {
  const results = [
    { type: "run-command", command: "x", on_failure: "halt", outcome: "success" },
  ];
  const entry = buildAuditEntry("before-commit", results);
  assert.equal(entry.actions[0].policy, "halt");
  assert.ok(!("on_failure" in entry.actions[0]), "on_failure must not appear in audit shape");
});

// ---------------------------------------------------------------------------
// Task 1.8 — buildAuditEntry for before-task (occurrences[])
// ---------------------------------------------------------------------------

test("buildAuditEntry before-task: first invocation index:0 batch:1 → occurrences[0] present", () => {
  const results = [
    { type: "run-command", command: "npm run lint", on_failure: "advisory", outcome: "success" },
  ];
  const entry = buildAuditEntry("before-task", results, { index: 0, batch: 1 });
  assert.ok(Array.isArray(entry.occurrences), "occurrences must be an array");
  assert.equal(entry.occurrences.length, 1);
  assert.equal(entry.occurrences[0].index, 0);
  assert.equal(entry.occurrences[0].batch, 1);
  assert.equal(entry.occurrences[0].status, "done");
});

test("buildAuditEntry before-task: second invocation appended → occurrences has two entries", () => {
  const results1 = [
    { type: "run-command", command: "npm run lint", on_failure: "advisory", outcome: "success" },
  ];
  const first = buildAuditEntry("before-task", results1, { index: 0, batch: 1 });

  const results2 = [
    { type: "run-command", command: "npm run lint", on_failure: "advisory", outcome: "success" },
  ];
  const second = buildAuditEntry("before-task", results2, { index: 1, batch: 2, existing: first });
  assert.equal(second.occurrences.length, 2);
  assert.equal(second.occurrences[0].index, 0);
  assert.equal(second.occurrences[1].index, 1);
  assert.equal(second.occurrences[1].batch, 2);
});

test("buildAuditEntry before-task: top-level status reflects worst outcome across occurrences", () => {
  // First invocation: done; second invocation: failed (halt) → top status = failed
  const results1 = [
    { type: "run-command", command: "npm run lint", on_failure: "advisory", outcome: "success" },
  ];
  const first = buildAuditEntry("before-task", results1, { index: 0, batch: 1 });
  assert.equal(first.status, "done");

  const results2 = [
    { type: "run-command", command: "npm run preflight", on_failure: "halt", outcome: "failed" },
  ];
  const second = buildAuditEntry("before-task", results2, { index: 1, batch: 2, existing: first });
  assert.equal(second.status, "failed",
    "top-level status must be 'failed' when any occurrence has halt failure");
});

test("buildAuditEntry before-task: occurrences do not include on_failure field (policy mapped)", () => {
  const results = [
    { type: "run-command", command: "npm test", on_failure: "advisory", outcome: "success" },
  ];
  const entry = buildAuditEntry("before-task", results, { index: 0, batch: 1 });
  const action = entry.occurrences[0].actions[0];
  assert.equal(action.policy, "advisory");
  assert.ok(!("on_failure" in action), "on_failure must not appear in occurrence action shape");
});

// ---------------------------------------------------------------------------
// Constants exports — smoke tests that the named exports exist and are correct
// ---------------------------------------------------------------------------

test("KNOWN_EVENTS contains all 7 lifecycle event names", () => {
  const expected = [
    "before-change",
    "before-implementation",
    "before-task",
    "before-commit",
    "before-verify",
    "after-verify",
    "after-archive",
  ];
  for (const e of expected) {
    assert.ok(
      KNOWN_EVENTS.includes(e),
      `KNOWN_EVENTS should include '${e}'`,
    );
  }
  assert.equal(KNOWN_EVENTS.length, 7, "KNOWN_EVENTS must have exactly 7 entries");
});

test("KNOWN_ACTION_TYPES contains the three action types", () => {
  assert.deepEqual([...KNOWN_ACTION_TYPES].sort(), ["load-rules", "load-skill", "run-command"]);
});

test("KNOWN_POLICIES contains advisory and halt", () => {
  assert.deepEqual([...KNOWN_POLICIES].sort(), ["advisory", "halt"]);
});

// ---------------------------------------------------------------------------
// Remediation — Finding 1 (reliability-C1): validateHooksBlock never throws
// ---------------------------------------------------------------------------

test("validateHooksBlock: null action element does not throw and produces error", () => {
  const hooks = { "before-change": [null] };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0, "errors must be non-empty");
  assert.ok(
    result.errors.some((e) => /action must be an object/i.test(e)),
    `error must mention 'action must be an object'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateHooksBlock: undefined action element does not throw and produces error", () => {
  // undefined array element (e.g. sparse array)
  const hooks = { "before-change": [undefined] };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /action must be an object/i.test(e)),
    `error must mention 'action must be an object'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateHooksBlock: primitive string action element does not throw and produces error", () => {
  // YAML `- foo` → string element
  const hooks = { "before-change": ["foo"] };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /action must be an object/i.test(e)),
    `error must mention 'action must be an object'; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateHooksBlock: non-array event value produces error (not silently skipped)", () => {
  // e.g. YAML `before-change: {}` → object, not an array
  const hooks = { "before-change": { type: "load-skill", skill: "x.md" } };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /actions must be a list/i.test(e)),
    `error must mention 'actions must be a list'; got: ${JSON.stringify(result.errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Remediation — Finding 2 (security): load-skill path confinement
// ---------------------------------------------------------------------------

test("validateHooksBlock: load-skill with path traversal (..) is rejected", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", skill: "../../.env" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /load-skill.*skill.*relative.*skills/i.test(e) || /skills\//i.test(e) || /\.\./i.test(e)),
    `error must mention path confinement; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: load-skill with absolute path is rejected", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", skill: "/etc/passwd" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /load-skill.*skill.*relative.*skills/i.test(e) || /skills\//i.test(e)),
    `error must mention path confinement; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: load-skill with Windows drive letter is rejected", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", skill: "C:\\Windows\\system32\\cmd.exe" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /load-skill.*skill.*relative.*skills/i.test(e) || /skills\//i.test(e)),
    `error must mention path confinement; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: load-skill with valid skills/ path is accepted", () => {
  const hooks = {
    "before-change": [{ type: "load-skill", skill: "skills/sec/SKILL.md" }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, true, `expected valid; errors: ${JSON.stringify(errors)}`);
});

// ---------------------------------------------------------------------------
// Remediation — Finding 3 (security): load-rules length cap
// ---------------------------------------------------------------------------

test("validateHooksBlock: load-rules text exceeding 4000 chars is rejected", () => {
  const longRules = "x".repeat(4001);
  const hooks = {
    "before-verify": [{ type: "load-rules", rules: longRules }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /rules.*length|too long|4000|exceed/i.test(e)),
    `error must mention length cap; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: load-rules text at exactly 4000 chars is accepted", () => {
  const rules = "x".repeat(4000);
  const hooks = {
    "before-verify": [{ type: "load-rules", rules }],
  };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, true, `expected valid at boundary; errors: ${JSON.stringify(errors)}`);
});

// ---------------------------------------------------------------------------
// Remediation pass #2 — FIX 1: non-string skill rejected without throw
// ---------------------------------------------------------------------------

test("validateHooksBlock: skill: 42 (integer) does not throw and produces error", () => {
  const hooks = { "before-change": [{ type: "load-skill", skill: 42 }] };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /skill.*must be a string/i.test(e)),
    `error must mention "skill must be a string"; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateHooksBlock: skill: true (boolean) does not throw and produces error", () => {
  const hooks = { "before-change": [{ type: "load-skill", skill: true }] };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /skill.*must be a string/i.test(e)),
    `error must mention "skill must be a string"; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateHooksBlock: skill: {} (object) does not throw and produces error", () => {
  const hooks = { "before-change": [{ type: "load-skill", skill: {} }] };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /skill.*must be a string/i.test(e)),
    `error must mention "skill must be a string"; got: ${JSON.stringify(result.errors)}`,
  );
});

test("validateHooksBlock: skill: [1] (array) does not throw and produces error", () => {
  const hooks = { "before-change": [{ type: "load-skill", skill: [1] }] };
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(hooks); });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /skill.*must be a string/i.test(e)),
    `error must mention "skill must be a string"; got: ${JSON.stringify(result.errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Remediation pass #2 — FIX 2: non-string rules rejected
// ---------------------------------------------------------------------------

test("validateHooksBlock: rules: 42 (number) produces error and is rejected", () => {
  const hooks = { "before-verify": [{ type: "load-rules", rules: 42 }] };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /rules.*must be a string/i.test(e)),
    `error must mention "rules must be a string"; got: ${JSON.stringify(errors)}`,
  );
});

test("validateHooksBlock: rules: {} (object) produces error and is rejected", () => {
  const hooks = { "before-verify": [{ type: "load-rules", rules: {} }] };
  const { valid, errors } = validateHooksBlock(hooks);
  assert.equal(valid, false);
  assert.ok(
    errors.some((e) => /rules.*must be a string/i.test(e)),
    `error must mention "rules must be a string"; got: ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Remediation pass #3 — FIX: entry guard, validateHooksBlock never throws on
// a null/undefined/non-object argument (absolute never-throw contract).
// ---------------------------------------------------------------------------

test("validateHooksBlock: null argument does not throw and is valid (no hooks)", () => {
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(null); });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateHooksBlock: undefined argument does not throw and is valid (no hooks)", () => {
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(undefined); });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateHooksBlock: array argument does not throw and is valid (no hooks)", () => {
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock([1, 2, 3]); });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("validateHooksBlock: primitive argument does not throw and is valid (no hooks)", () => {
  let result;
  assert.doesNotThrow(() => { result = validateHooksBlock(42); });
  assert.deepEqual(result, { valid: true, errors: [] });
});
