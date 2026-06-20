"use strict";

// ============================================================================
// Purity Contract:
// This module MUST be completely pure. No filesystem I/O, no network request,
// and no external runtime dependencies. Zero side effects.
// ============================================================================

/**
 * Compare two strings lexicographically.
 * Matches the compareStrings helper in skill-registry.js.
 */
function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}

function parseKeyValue(str, entry) {
  const kvMatch = str.match(/^([\w.\-]+):\s*(.*)$/);
  if (!kvMatch) {
    return;
  }
  const key = kvMatch[1];
  const val = kvMatch[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  if (key === "name") {
    entry.name = val;
  } else if (key === "version") {
    entry.version = val;
  } else if (key === "source") {
    entry.source = val;
  }
}

/**
 * Parse the `capabilities:` block from `openspec/config.yaml` content.
 *
 * Supported block-sequence schema:
 *   capabilities:
 *     - name: <string>
 *       version: <string> (optional)
 *       source: <string> (optional, defaults to "declared")
 *
 * @param {string} configContent - Full text of config.yaml
 * @returns {object[]} Parsed capability entries, or [] if block absent/empty/inline []
 */
function parseCapabilities(configContent) {
  if (configContent === null || configContent === undefined) {
    return [];
  }
  const lines = String(configContent).split(/\r?\n/);
  const entries = [];
  let inCapabilities = false;
  let currentEntry = null;

  function finalizeEntry() {
    if (currentEntry !== null) {
      if (currentEntry.name) {
        entries.push(currentEntry);
      }
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

    if (indent === 0) {
      finalizeEntry();
      if (trimmed === "capabilities:") {
        inCapabilities = true;
      } else {
        inCapabilities = false;
      }
      continue;
    }

    if (!inCapabilities) {
      continue;
    }

    if (indent === 2 && trimmed.startsWith("- ")) {
      finalizeEntry();
      currentEntry = { version: null, source: "declared" };
      const rest = trimmed.slice(2).trim();
      parseKeyValue(rest, currentEntry);
    } else if (indent === 4 && currentEntry !== null) {
      parseKeyValue(trimmed, currentEntry);
    } else {
      finalizeEntry();
    }
  }

  finalizeEntry();
  return entries;
}

/**
 * Extract active capability names from parsed entries.
 *
 * @param {object[]} entries - Array of capability entries
 * @returns {string[]} Names in declaration order
 */
function capabilityNames(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }
  return entries
    .filter((e) => e && typeof e === "object" && typeof e.name === "string")
    .map((e) => e.name)
    .filter(Boolean);
}

/**
 * Filter and sort stack-skill entries matching active capabilities.
 *
 * @param {string[]} names - Active capability names
 * @param {object[]} skillEntries - All skill registry entries
 * @returns {object[]} Matched stack-skill entries sorted by ID ascending
 */
function matchStackSkills(names, skillEntries) {
  if (!Array.isArray(names) || !Array.isArray(skillEntries)) {
    return [];
  }
  const nameSet = new Set(names);
  const matched = skillEntries.filter((entry) => {
    if (!entry || !Array.isArray(entry.capabilities)) {
      return false;
    }
    return entry.capabilities.some((cap) => nameSet.has(cap));
  });
  matched.sort((a, b) => compareStrings(a.id, b.id));
  return matched;
}

module.exports = {
  parseCapabilities,
  capabilityNames,
  matchStackSkills,
};
