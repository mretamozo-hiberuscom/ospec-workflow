"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

// Dependency-free parser for the constrained workspace.yaml subset:
// top-level scalars, a `members` list of maps, and a `contracts` list of maps
// (with an inline `consumers: [a, b]` list). Anything deeper is ignored.
// Mirrors the hand-rolled parsers in ospec-state.js — the repo forbids npm deps.

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

function topLevelSectionLines(content, sectionName) {
  const lines = content.split(/\r?\n/);
  const section = [];
  let collecting = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!collecting) {
      if (indent === 0 && new RegExp(`^${sectionName}:\\s*$`).test(trimmed)) {
        collecting = true;
      }

      continue;
    }

    if (trimmed && indent === 0) {
      break;
    }

    section.push(raw);
  }

  return section;
}

function parseListOfMaps(content, sectionName) {
  const items = [];
  let current = null;
  let itemIndent = null;

  for (const raw of topLevelSectionLines(content, sectionName)) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (itemIndent === null) {
        itemIndent = indent;
      }

      if (indent !== itemIndent) {
        continue;
      }

      current = {};
      items.push(current);

      const field = trimmed.slice(2).trim().match(/^([^:]+):\s*(.*)$/);

      if (field) {
        assignField(current, field[1].trim(), field[2]);
      }

      continue;
    }

    // Map fields live exactly one indent step below the list item. Deeper
    // (unsupported) nesting is ignored rather than mis-parsed.
    if (current && itemIndent !== null && indent === itemIndent + 2) {
      const field = trimmed.match(/^([^:]+):\s*(.*)$/);

      if (field) {
        assignField(current, field[1].trim(), field[2]);
      }
    }
  }

  return items;
}

function parseAtlas(content) {
  if (typeof content !== "string" || !content.trim()) {
    return { members: [], contracts: [] };
  }

  const members = parseListOfMaps(content, "members").filter(
    (member) => member.id,
  );
  const contracts = parseListOfMaps(content, "contracts")
    .filter((contract) => contract.id)
    .map((contract) => ({
      ...contract,
      consumers: Array.isArray(contract.consumers) ? contract.consumers : [],
    }));

  return { members, contracts };
}

async function isReachable(memberRoot) {
  try {
    return (await fs.stat(path.join(memberRoot, "changes"))).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function resolveMembers(workspace, atlas) {
  const base = path.resolve(workspace);
  const resolved = [];

  for (const member of atlas.members) {
    const root = path.resolve(
      base,
      member.path || "",
      member.openspec_root || "openspec",
    );

    resolved.push({
      id: member.id,
      root,
      reachable: await isReachable(root),
    });
  }

  return resolved;
}

function computeImpact(atlas, memberId) {
  const affected = new Set([memberId]);

  for (const contract of atlas.contracts) {
    if (contract.provider === memberId) {
      for (const consumer of contract.consumers || []) {
        affected.add(consumer);
      }
    }
  }

  return affected;
}

// --- Distributed marker support (C1 federation) ---------------------------
// The functions below ADD marker read/merge/serialize behavior beside the
// untouched `parseAtlas`. `openspec/federation.member.yaml` markers are the
// canonical truth; `openspec/workspace.yaml` is a derived cache rebuilt from
// them. The marker parser handles the constrained YAML subset used by the
// marker schema: nested `federation`/`member` blocks, inline-map list items
// for `provides`/`roster`, and top-level scalars.

const MARKER_RELATIVE_PATH = path.join("openspec", "federation.member.yaml");

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
      const { items, nextIndex } = parseMarkerList(lines, childIndex, childIndent);

      block[key] = items;
      cursor = nextIndex;
    } else {
      const { value, nextIndex } = parseMarkerBlock(lines, childIndex, childIndent);

      block[key] = value;
      cursor = nextIndex;
    }
  }

  return { value: block, nextIndex: cursor };
}

function parseMarker(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("empty marker content");
  }

  return parseMarkerBlock(content.split(/\r?\n/), 0, 0).value;
}

async function loadMarkerFromMember(memberRoot) {
  const markerPath = path.join(memberRoot, MARKER_RELATIVE_PATH);
  let content;

  try {
    content = await fs.readFile(markerPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      warning: `cannot read marker at ${markerPath}: ${error.message}`,
    };
  }

  let marker;

  try {
    marker = parseMarker(content);
  } catch (error) {
    return {
      ok: false,
      warning: `cannot parse marker at ${markerPath}: ${error.message}`,
    };
  }

  if (!marker || !marker.member || !marker.member.id) {
    return {
      ok: false,
      warning: `marker at ${markerPath} is missing member.id`,
    };
  }

  if (!marker.member.remote) {
    return {
      ok: true,
      marker,
      warning: `member "${marker.member.id}" has no remote; it is not remotely reconstructible`,
    };
  }

  return { ok: true, marker };
}

function parseGitmodulesPaths(content) {
  const paths = [];

  for (const line of content.split(/\r?\n/)) {
    const match = line.trim().match(/^path\s*=\s*(.+)$/);

    if (match) {
      paths.push(match[1].trim());
    }
  }

  return paths;
}

async function scanMemberMarkers(containerRoot) {
  const memberDirs = new Set();

  try {
    const gitmodules = await fs.readFile(
      path.join(containerRoot, ".gitmodules"),
      "utf8",
    );

    for (const declared of parseGitmodulesPaths(gitmodules)) {
      memberDirs.add(declared);
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  let entries = [];

  try {
    entries = await fs.readdir(containerRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    try {
      const gitStat = await fs.stat(
        path.join(containerRoot, entry.name, ".git"),
      );

      if (gitStat.isDirectory() || gitStat.isFile()) {
        memberDirs.add(entry.name);
      }
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const results = [];

  for (const memberDir of memberDirs) {
    const loaded = await loadMarkerFromMember(
      path.join(containerRoot, memberDir),
    );

    if (loaded.ok) {
      results.push({ memberDir, marker: loaded.marker, warning: loaded.warning });
    } else {
      results.push({ memberDir, error: loaded.warning });
    }
  }

  const warnings = [];

  if (results.length === 0) {
    warnings.push(
      `no member repositories found in ${containerRoot} (depth-1 .git scan is empty)`,
    );
  }

  Object.defineProperty(results, "warnings", {
    value: warnings,
    enumerable: false,
  });

  return results;
}

function compareUpdatedAt(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) {
    if (leftTime === rightTime) {
      return 0;
    }

    return leftTime < rightTime ? -1 : 1;
  }

  if (String(left) === String(right)) {
    return 0;
  }

  return String(left) < String(right) ? -1 : 1;
}

function buildMemberEntry(member) {
  const entry = {};

  for (const key of ["id", "role", "type", "layer", "remote", "path", "openspec_root"]) {
    if (member[key] !== undefined) {
      entry[key] = member[key];
    }
  }

  return entry;
}

function buildRosterEntry(rosterMember) {
  const entry = { id: rosterMember.id };

  if (rosterMember.remote !== undefined) {
    entry.remote = rosterMember.remote;
  }

  return entry;
}

function considerCandidate(winners, warnings, id, candidate) {
  const existing = winners.get(id);

  if (!existing) {
    winners.set(id, candidate);
    return;
  }

  const comparison = compareUpdatedAt(candidate.updatedAt, existing.updatedAt);

  if (comparison > 0) {
    winners.set(id, candidate);
    return;
  }

  if (comparison === 0 && candidate.sourceId !== existing.sourceId) {
    const winnerSource =
      candidate.sourceId > existing.sourceId
        ? candidate.sourceId
        : existing.sourceId;

    warnings.push(
      `equal updated_at tie for "${id}"; resolved to source member "${winnerSource}"`,
    );

    if (candidate.sourceId > existing.sourceId) {
      winners.set(id, candidate);
    }
  }
}

function mergeMarkersIntoAtlas(markers) {
  const warnings = [];
  const winners = new Map();

  for (const marker of markers || []) {
    if (!marker || !marker.member || !marker.member.id) {
      warnings.push("skipped malformed marker (missing member.id)");
      continue;
    }

    const sourceId = marker.member.id;
    const updatedAt = marker.updated_at || "";

    considerCandidate(winners, warnings, marker.member.id, {
      entry: buildMemberEntry(marker.member),
      provides: Array.isArray(marker.member.provides) ? marker.member.provides : [],
      sourceId,
      updatedAt,
    });

    for (const rosterMember of marker.roster || []) {
      if (!rosterMember || !rosterMember.id) {
        continue;
      }

      considerCandidate(winners, warnings, rosterMember.id, {
        entry: buildRosterEntry(rosterMember),
        provides: [],
        sourceId,
        updatedAt,
      });
    }
  }

  const orderedIds = [...winners.keys()].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );

  const members = [];
  const contracts = [];

  for (const id of orderedIds) {
    const winner = winners.get(id);

    members.push(winner.entry);

    for (const provided of winner.provides) {
      if (!provided || !provided.id) {
        continue;
      }

      contracts.push({
        id: provided.id,
        provider: id,
        consumers: Array.isArray(provided.consumers) ? provided.consumers : [],
      });
    }
  }

  contracts.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );

  return { atlas: { members, contracts }, warnings };
}

function formatYamlList(values) {
  return `[${values.join(", ")}]`;
}

function formatYamlValue(value) {
  if (Array.isArray(value)) {
    return formatYamlList(value);
  }

  return String(value);
}

function serializeAtlas(atlas) {
  const members = Array.isArray(atlas && atlas.members) ? atlas.members : [];
  const contracts = Array.isArray(atlas && atlas.contracts)
    ? atlas.contracts
    : [];
  const lines = ["members:"];

  for (const member of members) {
    lines.push(`  - id: ${member.id}`);

    for (const [key, value] of Object.entries(member)) {
      if (key === "id" || value === undefined || value === null) {
        continue;
      }

      lines.push(`    ${key}: ${formatYamlValue(value)}`);
    }
  }

  lines.push("contracts:");

  for (const contract of contracts) {
    lines.push(`  - id: ${contract.id}`);

    if (contract.provider !== undefined && contract.provider !== null) {
      lines.push(`    provider: ${contract.provider}`);
    }

    lines.push(`    consumers: ${formatYamlList(contract.consumers || [])}`);

    for (const [key, value] of Object.entries(contract)) {
      if (
        key === "id" ||
        key === "provider" ||
        key === "consumers" ||
        value === undefined ||
        value === null
      ) {
        continue;
      }

      lines.push(`    ${key}: ${formatYamlValue(value)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

module.exports = {
  computeImpact,
  loadMarkerFromMember,
  mergeMarkersIntoAtlas,
  parseAtlas,
  resolveMembers,
  scanMemberMarkers,
  serializeAtlas,
};
