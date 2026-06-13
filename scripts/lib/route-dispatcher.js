"use strict";

// ---------------------------------------------------------------------------
// Known-name lists (hardcoded constants; no disk reads — purity requirement)
// Design decision: constants kept here so the module has zero side effects.
// ---------------------------------------------------------------------------

const KNOWN_PHASES = [
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

const KNOWN_GATES = [
  "clarify",
  "review-workload",
  "impact",
  "brownfield-advisory",
  "4r-review-gate",
];

const KNOWN_REVIEWERS = [
  "review-risk",
  "review-readability",
  "review-reliability",
  "review-resilience",
];

const KNOWN_CLASSES = ["trivial", "small", "normal", "high-risk"];

const KNOWN_COSTS = ["low", "medium", "high"];

// Derived/synthetic boolean signals — computed by the orchestrator (file I/O)
// and passed in via ctx; the dispatcher is pure (reads only its arguments).
const KNOWN_DERIVED_SIGNALS = ["specs_empty_with_code", "code_without_specs"];

// Top-level route fields that must coerce from YAML literal strings to boolean.
// Scoped to known fields to avoid surprising other string-valued fields (W2 fix).
const KNOWN_BOOLEAN_FIELDS = new Set(["experimental"]);

// ---------------------------------------------------------------------------
// Internal helpers (pure, no I/O)
// ---------------------------------------------------------------------------

/**
 * Strip trailing inline comment and surrounding quotes from a YAML scalar.
 * Mirrors the parseScalar helper in ospec-state.js.
 */
function parseScalar(value) {
  const trimmed = String(value).trim();
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

/**
 * If `val` looks like a YAML inline array `[a, b, c]`, return the parsed
 * string array.  Returns `null` when `val` is not an inline array.
 */
function parseInlineArray(val) {
  const match = String(val).trim().match(/^\[([^\]]*)\]$/);

  if (!match) {
    return null;
  }

  const inner = match[1].trim();

  if (!inner) {
    return [];
  }

  return inner.split(",").map((s) => parseScalar(s.trim()));
}

/**
 * Parse a YAML scalar or inline array value.
 */
function parseScalarOrInlineArray(val) {
  if (val === null || val === undefined || val === "") {
    return val;
  }

  const arr = parseInlineArray(val);

  if (arr !== null) {
    return arr;
  }

  return parseScalar(val);
}

/**
 * Coerce a string scalar from YAML to a native boolean when it is the literal
 * text 'true' or 'false'.  All other values pass through unchanged.
 */
function coerceBoolean(val) {
  if (val === "true") return true;
  if (val === "false") return false;
  return val;
}

// ---------------------------------------------------------------------------
// matchConditions(conditions, ctx) → boolean
// ---------------------------------------------------------------------------

/**
 * Evaluate the extended conditions model against a caller-supplied context.
 *
 * Semantics:
 *   - `match: 'any'` → OR-s sibling condition keys (at least one must match).
 *   - `match: 'all'` (default) → AND-s all sibling condition keys (every one must match).
 *   - Array value for a key → ANY-of: matches when ctx[key] equals any element.
 *   - Scalar/boolean value → strict equality: ctx[key] === expected.
 *   - Empty keys set: 'all' is vacuously true; 'any' is false.
 *   - Absent ctx key: undefined, which fails a strict-equality check (no-match).
 *
 * Pure: reads only its arguments; no I/O, no global mutation.
 * Derived signals (e.g. specs_empty_with_code) are pre-computed by the caller.
 *
 * @param {object} conditions - Conditions map (may include 'match' meta-key)
 * @param {object} ctx        - Change context (caller-supplied; may include derived signals)
 * @returns {boolean}
 */
function matchConditions(conditions, ctx) {
  if (conditions === null || typeof conditions !== "object" || Array.isArray(conditions)) {
    return false;
  }

  const keys = Object.keys(conditions).filter((k) => k !== "match");
  const mode = conditions.match === "any" ? "any" : "all";

  // Edge case: no condition keys
  if (keys.length === 0) {
    // Vacuously true for 'all', false for 'any'
    return mode === "all";
  }

  for (const key of keys) {
    const expected = conditions[key];
    const actual = ctx[key];

    let keyMatches;
    if (Array.isArray(expected)) {
      keyMatches = expected.includes(actual);
    } else {
      // Strict equality — boolean false in ctx correctly fails boolean true in conditions
      keyMatches = expected === actual;
    }

    if (mode === "all" && !keyMatches) {
      return false;
    }
    if (mode === "any" && keyMatches) {
      return true;
    }
  }

  // mode === "all" → every key matched → true
  // mode === "any" → no key matched → false
  return mode === "all";
}

// ---------------------------------------------------------------------------
// validateRoute(entry) → { valid: boolean, errors: string[] }
// ---------------------------------------------------------------------------

const REQUIRED_FIELDS = ["name", "classification", "conditions", "phases", "gates", "description"];

/**
 * Validate a single route entry for well-formedness.
 * Pure: no I/O, no global mutation.  Advisory-only — the orchestrator MAY
 * proceed even when this returns { valid: false }.
 *
 * @param {object} entry - A routing table entry object.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRoute(entry) {
  const errors = [];

  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return { valid: false, errors: ["route entry must be an object"] };
  }

  // --- Required fields presence ---
  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) {
      errors.push(`missing required field: ${field}`);
    }
  }

  // If critical fields are missing entirely, bail early to avoid cascade errors
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // --- name: non-empty string ---
  if (typeof entry.name !== "string") {
    errors.push(
      `field 'name' must be a string; received ${typeof entry.name}`,
    );
  } else if (entry.name.trim() === "") {
    errors.push("field 'name' must not be empty");
  }

  // --- classification: string or string[] of KNOWN_CLASSES ---
  const classifications = Array.isArray(entry.classification)
    ? entry.classification
    : [entry.classification];

  for (const cls of classifications) {
    if (!KNOWN_CLASSES.includes(cls)) {
      errors.push(
        `unknown classification value '${cls}'; must be one of [${KNOWN_CLASSES.join(", ")}]`,
      );
    }
  }

  // --- conditions: must be a plain object ---
  if (
    entry.conditions === null ||
    typeof entry.conditions !== "object" ||
    Array.isArray(entry.conditions)
  ) {
    errors.push("field 'conditions' must be an object");
  } else {
    // Extended conditions validation:
    // (1) 'match' meta-key, if present, must be 'all' or 'any'
    if ("match" in entry.conditions) {
      const matchVal = entry.conditions.match;
      if (matchVal !== "all" && matchVal !== "any") {
        errors.push(
          `conditions 'match' must be 'all' or 'any'; received '${matchVal}'`,
        );
      }
    }
    // (2) KNOWN_DERIVED_SIGNALS keys, if present, must have boolean values
    for (const signal of KNOWN_DERIVED_SIGNALS) {
      if (signal in entry.conditions) {
        const signalVal = entry.conditions[signal];
        if (typeof signalVal !== "boolean") {
          errors.push(
            `conditions key '${signal}' must be a boolean; received ${typeof signalVal}`,
          );
        }
      }
    }
  }

  // --- phases: non-empty array of KNOWN_PHASES ---
  if (!Array.isArray(entry.phases)) {
    errors.push("field 'phases' must be an array");
  } else if (entry.phases.length === 0) {
    errors.push("phases must not be empty");
  } else {
    for (const phase of entry.phases) {
      if (!KNOWN_PHASES.includes(phase)) {
        errors.push(
          `unknown phase '${phase}'; must be one of [${KNOWN_PHASES.join(", ")}]`,
        );
      }
    }
  }

  // --- gates: array (may be empty) of KNOWN_GATES ---
  if (!Array.isArray(entry.gates)) {
    errors.push("field 'gates' must be an array");
  } else {
    for (const gate of entry.gates) {
      if (!KNOWN_GATES.includes(gate)) {
        errors.push(
          `unknown gate '${gate}'; must be one of [${KNOWN_GATES.join(", ")}]`,
        );
      }
    }
  }

  // --- description: non-empty string ---
  if (typeof entry.description !== "string") {
    errors.push("field 'description' must be a string");
  } else if (entry.description.trim() === "") {
    errors.push("field 'description' must not be empty");
  }

  // --- Optional: cost (one of KNOWN_COSTS) ---
  if ("cost" in entry && entry.cost !== undefined) {
    if (!KNOWN_COSTS.includes(entry.cost)) {
      errors.push(
        `unknown cost value '${entry.cost}'; must be one of [${KNOWN_COSTS.join(", ")}]`,
      );
    }
  }

  // --- Optional: experimental (boolean) ---
  if ("experimental" in entry && entry.experimental !== undefined) {
    if (typeof entry.experimental !== "boolean") {
      errors.push(
        `field 'experimental' must be a boolean; received ${typeof entry.experimental}`,
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// validateRouteTable(routes) → { valid: boolean, errors: string[] }
// ---------------------------------------------------------------------------

/**
 * Validate a full routing table: per-entry checks + duplicate-name detection.
 * Pure: no I/O, no global mutation.
 *
 * @param {object[]} routes - Array of route entry objects.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateRouteTable(routes) {
  if (!Array.isArray(routes)) {
    return { valid: false, errors: ["routing table must be an array"] };
  }

  const errors = [];
  const seen = new Set();

  for (let i = 0; i < routes.length; i++) {
    const entry = routes[i];
    const result = validateRoute(entry);

    if (!result.valid) {
      errors.push(...result.errors);
    }

    // Duplicate name detection (only for string names that pass individual validation)
    if (entry && typeof entry.name === "string" && entry.name.trim() !== "") {
      const key = entry.name.trim();

      if (seen.has(key)) {
        errors.push(
          `duplicate route name '${key}' found in routing table`,
        );
      } else {
        seen.add(key);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// parseRoutingTable(content) → route[]
// ---------------------------------------------------------------------------

// Indent levels used in the supported YAML subset
const ROUTING_TOP_KEY = "routing:";
const ROUTING_TOP_EMPTY = "routing: []";
const ENTRY_INDENT = 2;   // "  - name: ..."
const FIELD_INDENT = 4;   // "    field: value"
const SUBFIELD_INDENT = 6; // "      key: value" / "      - item"

/**
 * Parse the `routing:` block from `openspec/config.yaml` content.
 *
 * Supported subset (documented in docs/sdd-routing.md):
 *   - Scalar fields (string)
 *   - Inline arrays: `[a, b, c]` or `[]`
 *   - Block sequences: `- item` lines at SUBFIELD_INDENT
 *   - Nested `conditions:` map of `key: value` pairs at SUBFIELD_INDENT
 *
 * Comments (#) and blank lines are ignored.
 * Unknown fields at FIELD_INDENT are stored on the entry object as-is.
 *
 * @param {string} content - Full text of config.yaml
 * @returns {object[]} Parsed route entries (empty array when block absent/empty)
 */
function parseRoutingTable(content) {
  const lines = String(content).split(/\r?\n/);
  let inRouting = false;
  let currentEntry = null;
  const entries = [];
  let currentArrayKey = null; // field name when accumulating a block sequence
  let inConditions = false;   // true while inside the `conditions:` sub-map

  function finalizeEntry() {
    if (currentEntry !== null) {
      entries.push(currentEntry);
      currentEntry = null;
    }
  }

  for (const raw of lines) {
    const trimmed = raw.trim();

    // Skip blank lines and comments
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = raw.match(/^\s*/)[0].length;

    // --- Top-level handling ---
    if (indent === 0) {
      if (trimmed === ROUTING_TOP_KEY) {
        finalizeEntry();
        inRouting = true;
      } else if (trimmed === ROUTING_TOP_EMPTY) {
        // routing: [] — empty inline, nothing to parse
        finalizeEntry();
        inRouting = false;
      } else {
        // Left the routing block
        if (inRouting) {
          finalizeEntry();
        }

        inRouting = false;
      }

      currentArrayKey = null;
      inConditions = false;
      continue;
    }

    if (!inRouting) {
      continue;
    }

    // --- Entry starter: "  - name: ..." at ENTRY_INDENT ---
    if (indent === ENTRY_INDENT && trimmed.startsWith("- ")) {
      finalizeEntry();
      currentEntry = { conditions: {} };
      currentArrayKey = null;
      inConditions = false;

      // The first field may be inlined on the same line after "- "
      const rest = trimmed.slice(2).trim();
      const kvMatch = rest.match(/^([\w.\-]+):\s*(.*)$/);

      if (kvMatch) {
        const key = kvMatch[1];
        const rawVal = kvMatch[2].trim();
        const parsedVal = parseScalarOrInlineArray(rawVal === "" ? null : rawVal);
        currentEntry[key] =
          KNOWN_BOOLEAN_FIELDS.has(key) && typeof parsedVal === "string"
            ? coerceBoolean(parsedVal)
            : parsedVal;
      }

      continue;
    }

    if (currentEntry === null) {
      continue;
    }

    // --- Entry field at FIELD_INDENT: "    key: value" ---
    if (indent === FIELD_INDENT) {
      // A new field at field-level always ends any sub-block mode
      currentArrayKey = null;
      inConditions = false;

      const kvMatch = trimmed.match(/^([\w.\-]+):\s*(.*)$/);

      if (!kvMatch) {
        continue;
      }

      const key = kvMatch[1];
      const rawVal = kvMatch[2].trim();

      if (key === "conditions") {
        // Enter conditions map mode; value on same line is ignored
        inConditions = true;
        currentEntry.conditions = {};
      } else if (rawVal === "") {
        // Block sequence / sub-map to follow at SUBFIELD_INDENT
        currentArrayKey = key;
        currentEntry[key] = [];
      } else {
        const parsedVal = parseScalarOrInlineArray(rawVal);
        currentEntry[key] =
          KNOWN_BOOLEAN_FIELDS.has(key) && typeof parsedVal === "string"
            ? coerceBoolean(parsedVal)
            : parsedVal;
      }

      continue;
    }

    // --- Sub-fields at SUBFIELD_INDENT ---
    if (indent >= SUBFIELD_INDENT) {
      if (inConditions) {
        // "      key: value" inside conditions:
        const kvMatch = trimmed.match(/^([\w.\-]+):\s*(.*)$/);

        if (kvMatch) {
          const condKey = kvMatch[1];
          const rawCondVal = kvMatch[2].trim();
          // Use parseScalarOrInlineArray so inline arrays round-trip to JS arrays.
          // Then apply boolean coercion to scalar strings — EXCEPT for the 'match'
          // meta-key, which must remain a string ('any'/'all').
          const parsedCondVal = parseScalarOrInlineArray(rawCondVal);
          currentEntry.conditions[condKey] =
            condKey !== "match" && typeof parsedCondVal === "string"
              ? coerceBoolean(parsedCondVal)
              : parsedCondVal;
        }
      } else if (currentArrayKey !== null) {
        // "      - item" inside a block sequence
        const itemMatch = trimmed.match(/^-\s+(.+)$/);

        if (itemMatch) {
          if (!Array.isArray(currentEntry[currentArrayKey])) {
            currentEntry[currentArrayKey] = [];
          }

          currentEntry[currentArrayKey].push(itemMatch[1].trim());
        }
      }
    }
  }

  finalizeEntry();
  return entries;
}

// ---------------------------------------------------------------------------
// classifyChange(ctx) → { classification: string|null, confidence }
// ---------------------------------------------------------------------------

const DETERMINISTIC_SIGNAL_KEYS = new Set([
  "classification",
  "project.status",
  "baseline.status",
  "artifact_store.backend",
  // Derived signals — computed deterministically by the orchestrator (file I/O);
  // presence in ctx means the orchestrator already resolved them without user input.
  "specs_empty_with_code",
  "code_without_specs",
]);

/**
 * Determine whether the change context provides deterministic or advisory
 * routing signals.
 *
 * Deterministic signals (binary/enum-valued, no user input needed):
 *   - `classification` (explicit)
 *   - `project.status`
 *   - `baseline.status`
 *   - `artifact_store.backend`
 *
 * All other signals require intent inference and are ADVISORY — the
 * orchestrator MUST surface these via `vscode/askQuestions` and MUST NOT
 * auto-route.
 *
 * Pure: reads only its argument, no side effects.
 *
 * @param {object} ctx - Change context signals
 * @returns {{ classification: string|null, confidence: 'deterministic'|'advisory' }}
 */
function classifyChange(ctx) {
  if (ctx === null || typeof ctx !== "object") {
    return { classification: null, confidence: "advisory" };
  }

  // Explicit classification takes priority
  if (typeof ctx.classification === "string") {
    return { classification: ctx.classification, confidence: "deterministic" };
  }

  // Other deterministic signals (routing can proceed without asking user)
  for (const key of Object.keys(ctx)) {
    if (DETERMINISTIC_SIGNAL_KEYS.has(key)) {
      return { classification: null, confidence: "deterministic" };
    }
  }

  // Intent must be inferred — advisory
  return { classification: null, confidence: "advisory" };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  KNOWN_PHASES,
  KNOWN_GATES,
  KNOWN_REVIEWERS,
  KNOWN_CLASSES,
  KNOWN_COSTS,
  KNOWN_DERIVED_SIGNALS,
  validateRoute,
  validateRouteTable,
  parseRoutingTable,
  classifyChange,
  matchConditions,
};
