"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");

// Write-only federation marker module (C1). `openspec/federation.member.yaml`
// is the canonical, version-controlled source of truth for a member repo.
// `enroll` is the ONLY sanctioned write into a member repo; it is idempotent
// and atomic. `parseMarker`/`serializeMarker` cover the constrained YAML subset
// used by the marker schema and round-trip with the cache serializer conventions
// established in workspace-atlas.js (inline-map list items for provides/roster,
// nested federation/member blocks, top-level scalars, updated_at last).

const MARKER_RELATIVE_PATH = path.join("openspec", "federation.member.yaml");

// --- YAML subset parser ----------------------------------------------------

function parseScalar(value) {
  const trimmed = String(value).trim();
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseInlineList(value) {
  const match = String(value).trim().match(/^\[(.*)\]$/);

  if (!match) {
    return null;
  }

  const inner = match[1].trim();

  if (!inner) {
    return [];
  }

  return inner
    .split(",")
    .map((item) => parseScalar(item))
    .filter(Boolean);
}

function assignField(target, key, rawValue) {
  const inlineList = parseInlineList(rawValue);

  target[key] = inlineList !== null ? inlineList : parseScalar(rawValue);
}

function splitInlineMembers(text) {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const char of text) {
    if (char === "[" || char === "{") {
      depth += 1;
    } else if (char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
    }

    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

function parseInlineMap(text) {
  const map = {};

  for (const part of splitInlineMembers(text)) {
    const field = part.match(/^([^:]+):\s*([\s\S]*)$/);

    if (field) {
      assignField(map, field[1].trim(), field[2]);
    }
  }

  return map;
}

function skipBlankLines(lines, index) {
  let cursor = index;

  while (cursor < lines.length) {
    const trimmed = lines[cursor].trim();

    if (trimmed && !trimmed.startsWith("#")) {
      break;
    }

    cursor += 1;
  }

  return cursor;
}

function parseMarkerList(lines, startIndex, baseIndent) {
  const items = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const raw = lines[cursor];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      cursor += 1;
      continue;
    }

    const indent = raw.match(/^\s*/)[0].length;

    if (indent < baseIndent || !trimmed.startsWith("- ")) {
      break;
    }

    const body = trimmed.slice(2).trim();

    if (body.startsWith("{") && body.endsWith("}")) {
      items.push(parseInlineMap(body.slice(1, -1)));
    } else {
      const field = body.match(/^([^:]+):\s*(.*)$/);

      if (field) {
        const item = {};

        assignField(item, field[1].trim(), field[2]);
        items.push(item);
      } else {
        items.push(parseScalar(body));
      }
    }

    cursor += 1;
  }

  return { items, nextIndex: cursor };
}

function parseMarkerBlock(lines, startIndex, baseIndent) {
  const block = {};
  let cursor = startIndex;

  while (cursor < lines.length) {
    const raw = lines[cursor];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      cursor += 1;
      continue;
    }

    const indent = raw.match(/^\s*/)[0].length;

    if (indent < baseIndent || trimmed.startsWith("- ")) {
      break;
    }

    if (indent > baseIndent) {
      cursor += 1;
      continue;
    }

    const field = trimmed.match(/^([^:]+):\s*(.*)$/);

    if (!field) {
      cursor += 1;
      continue;
    }

    const key = field[1].trim();
    const inlineValue = field[2];

    if (inlineValue) {
      assignField(block, key, inlineValue);
      cursor += 1;
      continue;
    }

    const childIndex = skipBlankLines(lines, cursor + 1);

    if (childIndex >= lines.length) {
      block[key] = {};
      cursor = childIndex;
      break;
    }

    const childIndent = lines[childIndex].match(/^\s*/)[0].length;

    if (childIndent <= baseIndent) {
      block[key] = null;
      cursor += 1;
      continue;
    }

    if (lines[childIndex].trim().startsWith("- ")) {
      const { items, nextIndex } = parseMarkerList(
        lines,
        childIndex,
        childIndent,
      );

      block[key] = items;
      cursor = nextIndex;
    } else {
      const { value, nextIndex } = parseMarkerBlock(
        lines,
        childIndex,
        childIndent,
      );

      block[key] = value;
      cursor = nextIndex;
    }
  }

  return { value: block, nextIndex: cursor };
}

/**
 * Parses the constrained YAML subset used by `openspec/federation.member.yaml`
 * markers into a plain object. Supports nested blocks (`federation`, `member`),
 * inline-map list items for `provides`/`roster`, and top-level scalars.
 *
 * @param {string} content - Raw YAML content of the marker file.
 * @returns {object} Parsed marker object with `federation`, `member`, `roster`,
 *   `origin`, and `updated_at` fields.
 * @throws {Error} When content is empty or not a string.
 */
function parseMarker(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("empty marker content");
  }

  return parseMarkerBlock(content.split(/\r?\n/), 0, 0).value;
}

// --- YAML subset serializer ------------------------------------------------

function formatScalar(value) {
  return String(value);
}

function formatInlineList(values) {
  return `[${values.map((value) => formatScalar(value)).join(", ")}]`;
}

function formatInlineMap(map) {
  const parts = [];

  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      parts.push(`${key}: ${formatInlineList(value)}`);
    } else {
      parts.push(`${key}: ${formatScalar(value)}`);
    }
  }

  return `{ ${parts.join(", ")} }`;
}

function serializeBlock(lines, block, indent) {
  const pad = " ".repeat(indent);

  for (const [key, value] of Object.entries(block)) {
    if (value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${pad}${key}: []`);
      } else {
        lines.push(`${pad}${key}:`);

        for (const item of value) {
          if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            lines.push(`${pad}  - ${formatInlineMap(item)}`);
          } else if (Array.isArray(item)) {
            lines.push(`${pad}  - ${formatInlineList(item)}`);
          } else {
            lines.push(`${pad}  - ${formatScalar(item)}`);
          }
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${pad}${key}:`);
      serializeBlock(lines, value, indent + 2);
    } else {
      lines.push(`${pad}${key}: ${formatScalar(value)}`);
    }
  }
}

/**
 * Serializes a marker data object into the constrained YAML subset. Fields are
 * emitted in insertion order except `updated_at`, which is always written last
 * as the merge timestamp. Empty arrays are serialized inline as `key: []`.
 *
 * @param {object} data - Marker data object (typically from `enroll` or `parseMarker`).
 * @returns {string} YAML string with trailing newline.
 */
function serializeMarker(data) {
  const source = data && typeof data === "object" ? data : {};
  const lines = [];

  // Emit every field except updated_at first, preserving the canonical block
  // order; updated_at is always written last as the merge timestamp.
  for (const [key, value] of Object.entries(source)) {
    if (key === "updated_at" || value === undefined || value === null) {
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);

        for (const item of value) {
          if (item !== null && typeof item === "object" && !Array.isArray(item)) {
            lines.push(`  - ${formatInlineMap(item)}`);
          } else if (Array.isArray(item)) {
            lines.push(`  - ${formatInlineList(item)}`);
          } else {
            lines.push(`  - ${formatScalar(item)}`);
          }
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${key}:`);
      serializeBlock(lines, value, 2);
    } else {
      lines.push(`${key}: ${formatScalar(value)}`);
    }
  }

  if (source.updated_at !== undefined && source.updated_at !== null) {
    lines.push(`updated_at: ${formatScalar(source.updated_at)}`);
  }

  return `${lines.join("\n")}\n`;
}

// --- enroll ----------------------------------------------------------------

function stripTimestamp(data) {
  const { updated_at: _ignored, ...rest } = data || {};

  return rest;
}

async function readExistingMarker(markerPath) {
  let content;

  // Read and parse are distinct failure domains and MUST be told apart:
  //   - ENOENT on read  → the marker is absent; return null so enroll writes a
  //                        fresh one.
  //   - any other read error (EACCES/EBUSY/EISDIR/transient lock) → a genuine
  //                        I/O fault; RETHROW so enroll aborts for this member
  //                        instead of treating a healthy-but-unreadable marker
  //                        as absent and OVERWRITING it (data loss).
  //   - parse failure on present content → the marker is corrupt; return null
  //                        so enroll self-heals by rewriting it cleanly.
  try {
    content = await fs.readFile(markerPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  try {
    return parseMarker(content);
  } catch {
    // A present-but-unparseable marker is treated as absent so enroll can
    // rewrite it cleanly (self-heal) rather than aborting.
    return null;
  }
}

const ORIGIN_PRECEDENCE = {
  explore: 1,
  init: 2,
  manual: 3,
};

/**
 * The ONLY sanctioned write into a member repo. Writes (or updates)
 * `openspec/federation.member.yaml` in the target member directory.
 *
 * Idempotent: calling with identical data does NOT rewrite the file and
 * does NOT refresh `updated_at`. Origin precedence is respected: a higher-
 * precedence origin on the existing marker is preserved over a lower one.
 *
 * @param {string} memberDir - Absolute path to the member repository root.
 * @param {object} data - Marker data to write (without `updated_at`).
 * @returns {Promise<{status: string, path: string, updated_at: string}>}
 *   `status` is `"written"` on change, `"fresh"` when content was identical.
 */
async function enroll(memberDir, data) {
  const openspecDir = path.join(memberDir, "openspec");
  const markerPath = path.join(memberDir, MARKER_RELATIVE_PATH);

  await fs.mkdir(openspecDir, { recursive: true });

  const incoming = stripTimestamp(data);
  const existing = await readExistingMarker(markerPath);

  if (existing) {
    const existingOrigin = existing.origin || "";
    const incomingOrigin = incoming.origin || "";
    const existingPrec = ORIGIN_PRECEDENCE[existingOrigin] || 0;
    const incomingPrec = ORIGIN_PRECEDENCE[incomingOrigin] || 0;

    if (existingPrec > incomingPrec) {
      incoming.origin = existing.origin;
    }
  }

  if (existing && isDeepStrictEqual(stripTimestamp(existing), incoming)) {
    return {
      status: "fresh",
      path: markerPath,
      updated_at: existing.updated_at,
    };
  }

  const updatedAt = new Date().toISOString();
  const serialized = serializeMarker({ ...incoming, updated_at: updatedAt });
  const tempPath = `${markerPath}.tmp`;

  await fs.writeFile(tempPath, serialized);
  await fs.rename(tempPath, markerPath);

  return { status: "written", path: markerPath, updated_at: updatedAt };
}

module.exports = {
  enroll,
  parseMarker,
  serializeMarker,
};
