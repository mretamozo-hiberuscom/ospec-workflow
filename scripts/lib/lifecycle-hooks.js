"use strict";

// ---------------------------------------------------------------------------
// Module purity contract — identical to route-dispatcher.js:
//   ZERO side effects: no file I/O, no `require` of runtime deps beyond
//   module.exports, no global mutation.  All behaviour is deterministic on
//   the arguments passed in.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Constants (hardcoded — purity requirement)
// ---------------------------------------------------------------------------

/**
 * The seven recognised lifecycle event names, in firing order.
 * Unknown keys in the `hooks:` block are silently ignored.
 */
const KNOWN_EVENTS = [
  "before-change",
  "before-implementation",
  "before-task",
  "before-commit",
  "before-verify",
  "after-verify",
  "after-archive",
];

/**
 * Recognised hook action types.
 */
const KNOWN_ACTION_TYPES = ["load-skill", "load-rules", "run-command"];

/**
 * Recognised `on_failure` policy values.
 */
const KNOWN_POLICIES = ["advisory", "halt"];

// ---------------------------------------------------------------------------
// Internal: event → required route phase mapping
// A `null` value means the event applies to ALL routes (always-true).
// ---------------------------------------------------------------------------

const EVENT_PHASE_MAP = {
  "before-change": null,              // always applies
  "before-implementation": "sdd-apply",
  "before-task": "sdd-apply",
  "before-commit": "sdd-apply",
  "before-verify": "sdd-verify",
  "after-verify": "sdd-verify",
  "after-archive": "sdd-archive",
};

// ---------------------------------------------------------------------------
// parseHooksBlock(rawHooks) → filtered hooks map
// ---------------------------------------------------------------------------

/**
 * Accept the already-parsed value of the `hooks:` key (object or null/undefined).
 * Returns an empty object when absent.  Filters keys to only those present in
 * KNOWN_EVENTS; preserves each event's action list as-is.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {object|null|undefined} rawHooks - Parsed `hooks:` value from config.yaml
 * @returns {object} Map of known-event keys → action arrays
 */
function parseHooksBlock(rawHooks) {
  if (rawHooks == null || typeof rawHooks !== "object" || Array.isArray(rawHooks)) {
    return {};
  }

  const result = {};

  for (const key of Object.keys(rawHooks)) {
    if (KNOWN_EVENTS.includes(key)) {
      result[key] = rawHooks[key];
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// _isConfinedSkillPath(skillPath) → boolean  [internal pure helper]
// ---------------------------------------------------------------------------

/**
 * Return true iff `skillPath` is a relative path confined to the `skills/` tree.
 *
 * Rejects:
 *   - Absolute paths (leading `/` or `\`)
 *   - Windows drive-letter paths (e.g. `C:\…` or `C:/…`)
 *   - Paths that contain `..` segments (directory traversal)
 *   - Paths that do not start with `skills/`
 *
 * Pure: string validation only, ZERO fs access.
 *
 * @param {string} skillPath
 * @returns {boolean}
 */
function _isConfinedSkillPath(skillPath) {
  // Defense-in-depth: caller is expected to gate on typeof === "string" first,
  // but guard here as well so a direct call with non-string input never throws.
  if (typeof skillPath !== "string") return false;
  // Reject absolute paths (Unix-style and Windows-style)
  if (skillPath.startsWith("/") || skillPath.startsWith("\\")) {
    return false;
  }
  // Reject Windows drive-letter prefixes (e.g. C:\ or C:/)
  if (/^[a-zA-Z]:/.test(skillPath)) {
    return false;
  }
  // Reject any path-traversal segments
  if (skillPath.includes("..")) {
    return false;
  }
  // Must be rooted under skills/
  if (!skillPath.startsWith("skills/")) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// validateHooksBlock(hooks) → { valid, errors }
// ---------------------------------------------------------------------------

/**
 * Advisory validation of a parsed hooks map.  Iterates all event/action entries
 * and checks structural well-formedness.  Returns { valid: boolean, errors: string[] }.
 *
 * This function MUST NEVER throw regardless of how malformed the input is.
 *
 * Checks performed per event:
 *   - event value must be an array; if non-null/non-undefined and not an array,
 *     an error is pushed (`{event}: actions must be a list`)
 *
 * Checks performed per action element:
 *   - element must be a plain object; null, undefined, or primitives push a
 *     descriptive error and are skipped without dereferencing
 *   - `type` present and in KNOWN_ACTION_TYPES
 *   - `on_failure` (when present) is in KNOWN_POLICIES
 *   - type-specific required fields:
 *       `load-skill`: `skill` required; must be a relative path under `skills/` without `..`
 *       `load-rules`: `rules` required; length must not exceed 4000 characters
 *       `run-command`: `command` required
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {object} hooks - Map of event keys → action arrays (result of parseHooksBlock)
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateHooksBlock(hooks) {
  const errors = [];

  // Entry guard: never throw on a null/undefined/non-object argument. An absent
  // or non-map hooks value means "no hooks to validate" → vacuously valid. This
  // mirrors parseHooksBlock's tolerance and upholds the absolute never-throw
  // contract even when called outside the parseHooksBlock → validateHooksBlock
  // pipeline.
  if (hooks === null || typeof hooks !== "object" || Array.isArray(hooks)) {
    return { valid: true, errors };
  }

  for (const [event, actions] of Object.entries(hooks)) {
    if (!Array.isArray(actions)) {
      // Non-null, non-undefined values that are not arrays are structurally invalid.
      if (actions !== null && actions !== undefined) {
        errors.push(`${event}: actions must be a list`);
      }
      continue;
    }

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const prefix = `${event}[${i}]`;

      // Guard: action element must be a plain (non-null, non-array) object.
      // Never dereference a null, undefined, or primitive element.
      if (action === null || action === undefined || typeof action !== "object" || Array.isArray(action)) {
        errors.push(`${prefix}: action must be an object`);
        continue;
      }

      // --- type ---
      if (!action.type || !KNOWN_ACTION_TYPES.includes(action.type)) {
        errors.push(
          `${prefix}: missing or invalid 'type' field (must be one of [${KNOWN_ACTION_TYPES.join(", ")}])`,
        );
      }

      // --- on_failure (optional) ---
      if (action.on_failure !== undefined && !KNOWN_POLICIES.includes(action.on_failure)) {
        errors.push(
          `${prefix}: invalid on_failure '${action.on_failure}' (must be one of [${KNOWN_POLICIES.join(", ")}])`,
        );
      }

      // --- type-specific required fields ---
      if (action.type === "load-skill") {
        if (!action.skill) {
          errors.push(`${prefix}: load-skill action missing required 'skill' field`);
        } else if (typeof action.skill !== "string") {
          // Present but non-string (e.g. YAML integer, boolean, object, array) —
          // _isConfinedSkillPath calls .startsWith() and would throw on non-strings.
          errors.push(`${prefix}: load-skill 'skill' must be a string`);
        } else if (!_isConfinedSkillPath(action.skill)) {
          errors.push(
            `${prefix}: load-skill 'skill' must be a relative path under skills/ without '..'`,
          );
        }
      }

      if (action.type === "load-rules") {
        if (!action.rules) {
          errors.push(`${prefix}: load-rules action missing required 'rules' field`);
        } else if (typeof action.rules !== "string") {
          // Present but non-string (e.g. YAML integer, object) — .length would be
          // undefined, making the > 4000 guard silently evaluate to false.
          errors.push(`${prefix}: load-rules 'rules' must be a string`);
        } else if (action.rules.length > 4000) {
          errors.push(
            `${prefix}: load-rules 'rules' exceeds maximum length of 4000 characters`,
          );
        }
      }

      if (action.type === "run-command" && !action.command) {
        errors.push(`${prefix}: run-command action missing required 'command' field`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// eventAppliesToRoute(event, routePhases) → boolean
// ---------------------------------------------------------------------------

/**
 * Determine whether the given lifecycle event should fire for the active route.
 *
 * Uses EVENT_PHASE_MAP: events with a null mapping always fire; events with a
 * phase name fire only when that phase appears in `routePhases`.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {string} event        - One of KNOWN_EVENTS
 * @param {string[]} routePhases - The `phases` array of the active route
 * @returns {boolean}
 */
function eventAppliesToRoute(event, routePhases) {
  const requiredPhase = EVENT_PHASE_MAP[event];

  // null → before-change, which applies to all routes
  if (requiredPhase === null || requiredPhase === undefined) {
    return true;
  }

  return Array.isArray(routePhases) && routePhases.includes(requiredPhase);
}

// ---------------------------------------------------------------------------
// planExecution(actions) → actions[]
// ---------------------------------------------------------------------------

/**
 * Return a shallow copy of `actions` in their original (declaration) order.
 *
 * Applies halt-stop semantics: if any action has `on_failure === 'halt'` AND
 * `outcome === 'failed'`, all subsequent entries in the returned array are
 * annotated with `outcome: 'skipped'`.  Actions prior to or at the halt point
 * are returned unchanged (with their existing outcome values).
 *
 * The caller is responsible for executing actions in order and supplying
 * outcomes on completed actions before calling this function for final
 * processing.  When called with actions that have no outcomes, this function
 * simply returns them in order (the "plan" step before execution).
 *
 * Pure: does not mutate `actions`; returns independent copies.
 *
 * @param {object[]} actions - Action objects, optionally with `outcome` set
 * @returns {object[]} Ordered copy with halt-stop applied
 */
function planExecution(actions) {
  // Create shallow copies so we never mutate the originals.
  const result = actions.map((a) => Object.assign({}, a));

  let halted = false;

  for (let i = 0; i < result.length; i++) {
    if (halted) {
      result[i].outcome = "skipped";
    } else if (
      result[i].outcome === "failed" &&
      result[i].on_failure === "halt"
    ) {
      halted = true;
      // The halt action itself retains its 'failed' outcome.
      // All entries AFTER it will be marked 'skipped' in the next iterations.
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// computeEventStatus(actionOutcomes) → 'done' | 'failed' | 'skipped'
// ---------------------------------------------------------------------------

/**
 * Compute the aggregate status for a lifecycle event from its action outcomes.
 *
 * Input objects are expected to have the audit shape (i.e. use `policy`, not
 * `on_failure`).  This function is called internally by `buildAuditEntry` after
 * the `on_failure` → `policy` mapping has been applied, and may also be called
 * directly in tests or by the orchestrator.
 *
 * Resolution rules (checked in order):
 *   1. If any action has `outcome: 'failed'` AND `policy: 'halt'` → 'failed'
 *   2. If ALL actions have `outcome: 'skipped'` (including empty array) → 'skipped'
 *   3. Otherwise → 'done'
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {Array<{outcome: string, policy: string}>} actionOutcomes
 * @returns {'done' | 'failed' | 'skipped'}
 */
function computeEventStatus(actionOutcomes) {
  // Rule 1: halt failure takes priority
  if (actionOutcomes.some((a) => a.outcome === "failed" && a.policy === "halt")) {
    return "failed";
  }

  // Rule 2: vacuously all-skipped (covers empty array via vacuous truth)
  if (actionOutcomes.every((a) => a.outcome === "skipped")) {
    return "skipped";
  }

  // Rule 3
  return "done";
}

// ---------------------------------------------------------------------------
// buildAuditEntry(event, results, opts) → audit entry object
// ---------------------------------------------------------------------------

/**
 * Build the `lifecycle_hooks.{event}` audit entry for persistence in state.yaml.
 *
 * When `results` is null or undefined, returns a skipped entry (used when
 * `eventAppliesToRoute` returned false for the current route).
 *
 * For `before-task`, returns an entry with an `occurrences[]` array (indexed
 * per apply invocation) instead of a flat `actions[]` array.  Pass
 * `opts.existing` (a previous entry) to append the new occurrence.
 *
 * For all other events, returns a flat entry with `status` and `actions[]`.
 *
 * The `on_failure` field on input results is mapped to `policy` in the output;
 * `on_failure` does NOT appear in the persisted audit shape.
 *
 * Pure: no I/O, no global mutation.
 *
 * @param {string} event   - One of KNOWN_EVENTS
 * @param {object[]|null} results - Action execution results, or null for skipped
 * @param {object} [opts]
 * @param {number} [opts.index]    - Occurrence index (before-task only)
 * @param {number} [opts.batch]    - Apply batch number (before-task only)
 * @param {object} [opts.existing] - Existing before-task entry to append to
 * @returns {object} Audit entry
 */
function buildAuditEntry(event, results, opts = {}) {
  // Skipped event: eventAppliesToRoute returned false
  if (results === null || results === undefined) {
    return { status: "skipped", actions: [] };
  }

  if (event === "before-task") {
    return _buildBeforeTaskEntry(results, opts);
  }

  return _buildSingleFireEntry(results);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Map a raw action result (with `on_failure`) to the audit shape (with `policy`).
 */
function _mapToAuditAction(raw) {
  const mapped = {};

  if (raw.type !== undefined) mapped.type = raw.type;
  if (raw.skill !== undefined) mapped.skill = raw.skill;
  if (raw.rules !== undefined) mapped.rules = raw.rules;
  if (raw.command !== undefined) mapped.command = raw.command;

  mapped.outcome = raw.outcome;
  mapped.policy = raw.policy !== undefined
    ? raw.policy
    : (raw.on_failure !== undefined ? raw.on_failure : "advisory");

  if (raw.message !== undefined) mapped.message = raw.message;

  return mapped;
}

/**
 * Compute the worst status across an array of occurrence objects.
 * Priority: failed > done > skipped
 */
function _worstOccurrenceStatus(occurrences) {
  let status = "skipped";

  for (const occ of occurrences) {
    if (occ.status === "failed") return "failed";
    if (occ.status === "done") status = "done";
  }

  return status;
}

/**
 * Build a flat (single-fire) audit entry.
 */
function _buildSingleFireEntry(results) {
  const auditActions = results.map(_mapToAuditAction);
  return {
    status: computeEventStatus(auditActions),
    actions: auditActions,
  };
}

/**
 * Build a `before-task` audit entry with `occurrences[]` (append-not-overwrite).
 */
function _buildBeforeTaskEntry(results, opts) {
  const auditActions = results.map(_mapToAuditAction);
  const occurrenceStatus = computeEventStatus(auditActions);

  const newOccurrence = {
    index: opts.index !== undefined ? opts.index : 0,
    batch: opts.batch !== undefined ? opts.batch : 1,
    status: occurrenceStatus,
    actions: auditActions,
  };

  const existing = opts.existing;
  const occurrences =
    existing && Array.isArray(existing.occurrences)
      ? [...existing.occurrences, newOccurrence]
      : [newOccurrence];

  return {
    status: _worstOccurrenceStatus(occurrences),
    occurrences,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  KNOWN_EVENTS,
  KNOWN_ACTION_TYPES,
  KNOWN_POLICIES,
  parseHooksBlock,
  validateHooksBlock,
  eventAppliesToRoute,
  planExecution,
  computeEventStatus,
  buildAuditEntry,
};
