"use strict";

// ---------------------------------------------------------------------------
// Module purity contract — identical to lifecycle-hooks.js:
//   ZERO side effects: no file I/O, no `require` of runtime deps beyond
//   module.exports, no global mutation.  All behaviour is deterministic on
//   the arguments passed in.
//
// Naming asymmetry (intentional): the CONFIG key is snake_case `quality_gates:`
// (YAML config convention), while the STATE gate name is kebab-case
// `gates.quality-gates` (matches the sibling gate names `clarify`,
// `4r-review-gate`).  See skills/_shared/openspec-convention.md.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants (hardcoded — purity requirement)
// ---------------------------------------------------------------------------

/**
 * The four recognised quality gate slot names.
 * Unknown keys in the `quality_gates:` block are silently ignored.
 */
const KNOWN_GATES = ["tests", "lint", "architecture", "security"];

/**
 * Recognised `on_fail` policy values.
 */
const KNOWN_ON_FAIL = ["advisory", "halt"];

/**
 * Default per-gate execution budget in milliseconds (H5). A gate whose
 * `timeout_ms` is absent, non-numeric, non-integer, or non-positive falls
 * back to this value. The agent aborts a gate command that exceeds it.
 */
const DEFAULT_GATE_TIMEOUT_MS = 120000;

/**
 * @returns {boolean} true when `n` is a positive integer.
 */
function isPositiveInt(n) {
  return typeof n === "number" && Number.isInteger(n) && n > 0;
}

/**
 * @returns {boolean} true when `v` is a plain (non-array, non-null) object.
 */
function isPlainObject(v) {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Coerce a raw coverage minimum to a number in [0,100]; returns undefined
 * when absent or invalid (H6). Never throws.
 *
 * @param {*} raw
 * @returns {number|undefined}
 */
function normalizeMinimum(raw) {
  if (raw === undefined || raw === null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined;
  return n;
}

// ---------------------------------------------------------------------------
// parseQualityGates(rawPolicy) → normalized policy | null
// ---------------------------------------------------------------------------

/**
 * Accept the already-parsed value of the `quality_gates:` key (object or
 * null/undefined).  Returns null when absent — a strict no-op signal.
 * Filters keys to only those present in KNOWN_GATES; applies defaults
 * (required: false, on_fail: 'advisory') for each recognised gate.
 * For the 'tests' gate, normalizes the optional `coverage` sub-object.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {object|null|undefined} rawPolicy - Parsed `quality_gates:` value
 * @returns {object|null} Normalized policy map or null when absent
 */
function parseQualityGates(rawPolicy) {
  if (rawPolicy == null || typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
    return null;
  }

  const result = {};

  for (const gateName of KNOWN_GATES) {
    if (!(gateName in rawPolicy)) continue;

    // A non-object gate value (e.g. `lint: "true"`) normalizes to safe defaults.
    const raw = isPlainObject(rawPolicy[gateName]) ? rawPolicy[gateName] : {};

    const gate = {
      required: typeof raw.required === "boolean" ? raw.required : false,
      on_fail: KNOWN_ON_FAIL.includes(raw.on_fail) ? raw.on_fail : "advisory",
      // H5 — bounded execution: a valid positive integer wins, else the default.
      timeout_ms: isPositiveInt(raw.timeout_ms) ? raw.timeout_ms : DEFAULT_GATE_TIMEOUT_MS,
    };

    if (raw.command !== undefined) {
      gate.command = raw.command;
    }

    // Normalize the coverage sub-object (tests gate only)
    if (gateName === "tests" && raw.coverage != null && typeof raw.coverage === "object") {
      gate.coverage = {};
      // H6 — coerce minimum to a number in [0,100]; omit when invalid so the
      // coverage sub-check is disabled rather than silently failing open.
      const min = normalizeMinimum(raw.coverage.minimum);
      if (min !== undefined) {
        gate.coverage.minimum = min;
      }
      if (raw.coverage.command !== undefined) {
        gate.coverage.command = raw.coverage.command;
      }
    }

    result[gateName] = gate;
  }

  return result;
}

// ---------------------------------------------------------------------------
// validateQualityGates(policy) → { valid, errors[] }
// ---------------------------------------------------------------------------

/**
 * Advisory validation of a parsed quality gates policy.  Iterates all gate
 * entries and checks structural well-formedness.  Returns { valid, errors[] }.
 *
 * This function MUST NEVER throw regardless of how malformed the input is.
 *
 * Checks performed per gate:
 *   - `on_fail` must be in KNOWN_ON_FAIL when present
 *   - `required` must be boolean when present
 *   - `timeout_ms` must be a positive integer when present (H5)
 *   - `tests.coverage.minimum` must be a number in [0,100] when present (H6)
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {object} policy - Normalized policy (result of parseQualityGates)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateQualityGates(policy) {
  const errors = [];

  try {
    if (policy == null || typeof policy !== "object" || Array.isArray(policy)) {
      return { valid: true, errors };
    }

    for (const [name, gate] of Object.entries(policy)) {
      if (gate == null || typeof gate !== "object") continue;

      if (gate.on_fail !== undefined && !KNOWN_ON_FAIL.includes(gate.on_fail)) {
        errors.push(
          `${name}: invalid on_fail '${gate.on_fail}' (must be one of [${KNOWN_ON_FAIL.join(", ")}])`,
        );
      }

      if (gate.required !== undefined && typeof gate.required !== "boolean") {
        errors.push(`${name}: 'required' must be a boolean`);
      }

      if (gate.timeout_ms !== undefined && !isPositiveInt(gate.timeout_ms)) {
        errors.push(`${name}: 'timeout_ms' must be a positive integer`);
      }

      if (
        gate.coverage != null &&
        typeof gate.coverage === "object" &&
        gate.coverage.minimum !== undefined &&
        normalizeMinimum(gate.coverage.minimum) === undefined
      ) {
        errors.push(
          `${name}: coverage.minimum invalid (must be a number in [0,100])`,
        );
      }
    }
  } catch (e) {
    errors.push(`unexpected error: ${e.message}`);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// parseCoverage(stdout) → number | null
// ---------------------------------------------------------------------------

/**
 * Parse the stdout of a coverage command (expected to be a percentage 0–100).
 * Returns null for null/undefined input, empty string, any non-numeric string,
 * or a value outside [0,100] (H6 — range-validate, do NOT clamp: an
 * out-of-range reading becomes a visible skip-with-warning, never a false pass).
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {string|null|undefined} stdout - Raw stdout from coverage command
 * @returns {number|null} Coverage percentage in [0,100] or null on failure
 */
function parseCoverage(stdout) {
  if (stdout == null) return null;
  const trimmed = String(stdout).trim();
  if (trimmed === "") return null;
  const num = parseFloat(trimmed);
  if (isNaN(num)) return null;
  if (num < 0 || num > 100) return null;
  return num;
}

// ---------------------------------------------------------------------------
// classifyCoverage(cfg, execResult) → { override?, detail? }
// ---------------------------------------------------------------------------

/**
 * Pure coverage sub-check, extracted from classifyGate (readability — keeps
 * coverage handling under 3 nesting levels). Applies only when the gate config
 * declares a normalized `coverage.minimum`. Returns an `override: 'fail'` when
 * coverage is below the minimum; otherwise an advisory `detail` for skip cases
 * (no override). Returns `{}` when the sub-check does not apply.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {object} cfg - Gate config: { coverage?: { minimum?, command? } }
 * @param {{ coverageStdout?: string }} execResult
 * @returns {{ override?: 'fail', detail?: string }}
 */
function classifyCoverage(cfg, execResult) {
  if (!cfg.coverage || cfg.coverage.minimum == null) {
    return {};
  }

  if (!cfg.coverage.command) {
    return { detail: "coverage.command not configured; coverage check skipped" };
  }

  const pct = parseCoverage(execResult.coverageStdout);
  if (pct === null) {
    // un-parseable OR out-of-range stdout → skip with warning, no fail override
    return { detail: "coverage output could not be parsed; coverage check skipped" };
  }
  if (pct < cfg.coverage.minimum) {
    return { override: "fail", detail: `coverage ${pct}% < minimum ${cfg.coverage.minimum}%` };
  }
  return {};
}

// ---------------------------------------------------------------------------
// classifyGate(name, cfg, execResult) → { status, detail? }
// ---------------------------------------------------------------------------

/**
 * Classify the result of a single quality gate based on the gate config and
 * execution result.
 *
 * Precedence (H4):
 * - Absent/empty command → { status: 'skipped', detail: 'command not configured' }
 * - execResult.timedOut → { status: 'error', detail: 'command timed out after Nms' }
 * - execResult.error != null OR exitCode not a finite number →
 *     { status: 'error', detail: 'command failed to execute: …' }
 * - exitCode 0 → { status: 'pass' }
 * - exitCode non-zero → { status: 'fail' }
 *
 * For the 'tests' gate the coverage sub-check (classifyCoverage) may override a
 * non-error status to 'fail' (below minimum) or attach a skip-with-warning
 * detail. A tool `error` is never downgraded by the coverage sub-check.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {string} name - Gate name (one of KNOWN_GATES)
 * @param {object} cfg  - Gate config: { command?, required, on_fail, coverage?, timeout_ms? }
 * @param {{ exitCode?: number, coverageStdout?: string, error?: *, timedOut?: boolean }} execResult
 * @returns {{ status: 'pass'|'fail'|'skipped'|'error', detail?: string }}
 */
function classifyGate(name, cfg, execResult) {
  if (!cfg.command) {
    return { status: "skipped", detail: "command not configured" };
  }

  // H5 — a timed-out gate is a tool error, distinct from a quality fail.
  if (execResult.timedOut) {
    const ms = cfg.timeout_ms != null ? cfg.timeout_ms : DEFAULT_GATE_TIMEOUT_MS;
    return { status: "error", detail: `command timed out after ${ms}ms` };
  }

  // H4 — a command that could not run is a tool error, not a quality fail.
  if (execResult.error != null || !Number.isFinite(execResult.exitCode)) {
    const reason = execResult.error != null ? String(execResult.error.message || execResult.error) : "non-numeric exit code";
    return { status: "error", detail: `command failed to execute: ${reason}` };
  }

  let status = execResult.exitCode === 0 ? "pass" : "fail";
  let detail;

  // Coverage sub-check applies only to the tests gate.
  if (name === "tests") {
    const cov = classifyCoverage(cfg, execResult);
    if (cov.override === "fail") status = "fail";
    if (cov.detail !== undefined) detail = cov.detail;
  }

  const result = { status };
  if (detail !== undefined) result.detail = detail;
  return result;
}

// ---------------------------------------------------------------------------
// enforceGate(name, cfg, result) → { finding, blocksArchive }
// ---------------------------------------------------------------------------

/**
 * Determine the enforcement finding for a gate based on its result.
 *
 * Acts when result.status is 'fail' OR 'error' (H4 — a tool error is treated
 * with the same severity as a quality fail). Enforcement matrix:
 *   - required && on_fail==='halt' → BLOCKER + blocksArchive:true
 *   - required && on_fail==='advisory' → WARNING + blocksArchive:false
 *   - required===false → no finding
 * Pass and skipped statuses always return no finding.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {string} name   - Gate name
 * @param {object} cfg    - Gate config: { required, on_fail }
 * @param {{ status: string }} result - Gate classification result
 * @returns {{ finding: 'BLOCKER'|'WARNING'|null, blocksArchive: boolean }}
 */
function enforceGate(name, cfg, result) {
  if (result.status !== "fail" && result.status !== "error") {
    return { finding: null, blocksArchive: false };
  }

  if (cfg.required && cfg.on_fail === "halt") {
    return { finding: "BLOCKER", blocksArchive: true };
  }

  if (cfg.required && cfg.on_fail === "advisory") {
    return { finding: "WARNING", blocksArchive: false };
  }

  return { finding: null, blocksArchive: false };
}

// ---------------------------------------------------------------------------
// aggregateStatus(gateResults) → 'pass' | 'fail' | 'skipped'
// ---------------------------------------------------------------------------

/**
 * Compute the aggregate top-level quality gate status from all gate results.
 *
 * Resolution rules (in order):
 *   1. Any gate with required:true, on_fail:'halt', status in {'fail','error'} → 'fail'
 *   2. All gates skipped (or empty array) → 'skipped'
 *   3. Otherwise → 'pass'
 *
 * A required-halt tool `error` (H4) is treated as blocking, same as a `fail`.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {Array<{ name: string, status: string, required: boolean, on_fail: string }>} gateResults
 * @returns {'pass'|'fail'|'skipped'}
 */
function aggregateStatus(gateResults) {
  // Rule 1: any halt-required failure or tool error takes priority
  const hasHaltFail = gateResults.some(
    (g) => g.required && g.on_fail === "halt" && (g.status === "fail" || g.status === "error"),
  );
  if (hasHaltFail) return "fail";

  // Rule 2: all skipped (covers empty array via vacuous truth)
  const allSkipped = gateResults.every((g) => g.status === "skipped");
  if (allSkipped) return "skipped";

  // Rule 3: at least one pass (or mix of pass/skipped with no halt fail)
  return "pass";
}

// ---------------------------------------------------------------------------
// buildAuditBlock(results, evaluatedAt) → audit block object
// ---------------------------------------------------------------------------

/**
 * Build the state.yaml gates.quality-gates audit block.
 *
 * Shape:
 * {
 *   status: aggregateStatus(results),
 *   evaluated_at: evaluatedAt,
 *   gates: {
 *     [name]: { status, required, on_fail, ...(detail ? {detail} : {}) }
 *   }
 * }
 *
 * The `override` key is NOT included — it is added by the orchestrator at
 * runtime when the user forces archive past a failed halt gate.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {Array<{ name, status, required, on_fail, detail? }>} results
 * @param {string} evaluatedAt - ISO 8601 UTC timestamp
 * @returns {object} Audit block for state.yaml
 */
function buildAuditBlock(results, evaluatedAt) {
  const gates = {};

  for (const r of results) {
    const entry = {
      status: r.status,
      required: r.required,
      on_fail: r.on_fail,
    };
    if (r.detail !== undefined) {
      entry.detail = r.detail;
    }
    gates[r.name] = entry;
  }

  return {
    status: aggregateStatus(results),
    evaluated_at: evaluatedAt,
    gates,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
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
};
