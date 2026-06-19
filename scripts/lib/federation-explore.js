"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  scanMemberMarkers,
  mergeMarkersIntoAtlas,
  serializeAtlas,
} = require("./workspace-atlas.js");
const { enroll } = require("./federation-marker.js");
const { writeFileAtomic } = require("./atomic-write.js");

// Executable backbone of the `sdd-workspace explore`/`classify` subcommand (C1,
// WU4). It realizes the workspace-explore phase: discover container members at
// depth 1, classify each one, enroll its canonical marker (idempotently), then
// regenerate the derived atlas cache and a human-readable workspace map. Markers
// are the only member-repo writes and they go exclusively through `enroll`. A
// per-member enroll failure is recorded as `pending` and never aborts the run;
// the atlas is rebuilt from the markers that were actually written.

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".cs",
  ".go",
  ".py",
  ".java",
  ".rb",
  ".php",
  ".vue",
]);

const SKIP_DIRS = new Set([
  ".git",
  "openspec",
  "node_modules",
  "bin",
  "obj",
  "dist",
  "build",
]);

const SOURCE_PROBE_MAX_DEPTH = 3;

// --- classification --------------------------------------------------------

async function readRootEntries(memberRoot) {
  try {
    return await fs.readdir(memberRoot, { withFileTypes: true });
  } catch {
    return [];
  }
}

function detectType(rootEntries) {
  const files = rootEntries.filter((entry) => entry.isFile());

  if (files.some((entry) => entry.name.endsWith(".csproj"))) {
    return "nuget";
  }

  const names = new Set(files.map((entry) => entry.name));

  if (names.has("package.json") || names.has("go.mod")) {
    return "microservicio";
  }

  return null;
}

function deriveLayer(type, memberName) {
  if (/common|shared/i.test(memberName)) {
    return "common";
  }

  if (type === "nuget") {
    return "common";
  }

  return "dominio";
}

async function hasSourceFiles(dir, maxDepth) {
  if (maxDepth < 0) {
    return false;
  }

  let entries;

  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }

      if (await hasSourceFiles(path.join(dir, entry.name), maxDepth - 1)) {
        return true;
      }
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name))
    ) {
      return true;
    }
  }

  return false;
}

async function fileExists(target) {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Classifies a member repository along four dimensions: type, layer,
 * brownfield/greenfield, and init-done.
 *
 * @param {string} memberRoot - Absolute path to the member repository root.
 * @returns {Promise<{type: string|null, layer: string|null, brownfield: boolean, initDone: boolean, warnings: string[]}>}
 */
async function classifyMember(memberRoot) {
  const memberName = path.basename(memberRoot);
  const rootEntries = await readRootEntries(memberRoot);
  const type = detectType(rootEntries);
  const layer = deriveLayer(type, memberName);
  const brownfield = await hasSourceFiles(memberRoot, SOURCE_PROBE_MAX_DEPTH);
  const initDone = await fileExists(
    path.join(memberRoot, "openspec", "config.yaml"),
  );
  const warnings = [];

  if (type === null) {
    warnings.push(
      `member "${memberName}" type could not be inferred from the filesystem; left null pending clarification`,
    );
  }

  return { type, layer, brownfield, initDone, warnings };
}

// --- map rendering ---------------------------------------------------------

function renderWorkspaceMap(containerId, rows) {
  const lines = [
    `# Workspace Map: ${containerId}`,
    "",
    "Derived from federation markers (`openspec/federation.member.yaml`) discovered at depth 1.",
    "",
    "| Member | Type | Layer | Brownfield | Init | Enroll | Notes |",
    "|--------|------|-------|-----------|------|--------|-------|",
  ];

  for (const row of rows) {
    const notes = [];

    if (row.enroll === "pending") {
      notes.push(`pending: ${row.reason}`);
    }

    for (const warning of row.warnings) {
      notes.push(warning);
    }

    lines.push(
      `| ${row.id} | ${row.type || "null"} | ${row.layer || "null"} | ${
        row.brownfield ? "yes" : "no"
      } | ${row.initDone ? "initialized" : "pending"} | ${row.enroll} | ${
        notes.join("; ") || "-"
      } |`,
    );
  }

  lines.push("");

  return `${lines.join("\n")}\n`;
}

// --- explore ---------------------------------------------------------------

/**
 * Builds the marker data object for a discovered member. The marker follows
 * the schema defined in the `federation-markers` spec with `origin: "explore"`
 * and an explicit empty roster.
 *
 * @param {string} containerId - The workspace container identifier.
 * @param {string} memberDir - The member directory name (relative to container root).
 * @param {{type: string|null, layer: string|null}} classification - Classification result.
 * @returns {{federation: {id: string}, member: object, roster: Array, origin: string}}
 */
function buildMemberData(containerId, memberDir, classification) {
  const member = { id: memberDir, role: "secondary" };

  if (classification.type) {
    member.type = classification.type;
  }

  if (classification.layer) {
    member.layer = classification.layer;
  }

  return { federation: { id: containerId }, member, roster: [], origin: "explore" };
}

/**
 * Executes the workspace-explore phase: discovers members at depth 1,
 * classifies each one, enrolls canonical markers (idempotently via `enroll`),
 * then regenerates the derived atlas cache and a human-readable workspace map.
 *
 * Per-member enroll failures are recorded as `pending` and never abort the run.
 * Marker schema is defined in the `federation-markers` spec.
 *
 * @param {string} containerRoot - Absolute path to the workspace container root.
 * @returns {Promise<{status: string, members: object[], artifacts: string[], warnings: string[]}>}
 */
async function explore(containerRoot) {
  const discovered = await scanMemberMarkers(containerRoot);
  const scanWarnings = [...(discovered.warnings || [])];

  if (discovered.length === 0) {
    return {
      status: "success",
      members: [],
      artifacts: [],
      warnings: scanWarnings,
    };
  }

  const containerId = path.basename(containerRoot);
  const memberRows = [];

  for (const { memberDir } of discovered) {
    const memberRoot = path.join(containerRoot, memberDir);
    const classification = await classifyMember(memberRoot);
    const data = buildMemberData(containerId, memberDir, classification);

    const row = {
      id: memberDir,
      type: classification.type,
      layer: classification.layer,
      brownfield: classification.brownfield,
      initDone: classification.initDone,
      warnings: [...classification.warnings],
    };

    try {
      const result = await enroll(memberRoot, data);

      row.enroll = result.status;
      row.updated_at = result.updated_at;
    } catch (error) {
      row.enroll = "pending";
      row.reason = error.message;
    }

    memberRows.push(row);
  }

  // Rebuild the derived atlas cache from the markers that were actually written
  // (failed enrolls leave no marker and are therefore excluded automatically).
  const rescan = await scanMemberMarkers(containerRoot);
  const markers = rescan
    .filter((entry) => entry.marker)
    .map((entry) => entry.marker);
  const { atlas, warnings: mergeWarnings } = mergeMarkersIntoAtlas(markers);

  const openspecDir = path.join(containerRoot, "openspec");

  await fs.mkdir(openspecDir, { recursive: true });

  const atlasPath = path.join(openspecDir, "workspace.yaml");
  const mapPath = path.join(openspecDir, "workspace-map.md");

  const artifacts = [];
  const exploreWarnings = [...scanWarnings, ...mergeWarnings];

  await writeFileAtomic(atlasPath, serializeAtlas(atlas));
  artifacts.push(atlasPath);

  try {
    await writeFileAtomic(mapPath, renderWorkspaceMap(containerId, memberRows));
    artifacts.push(mapPath);
  } catch (error) {
    exploreWarnings.push(`cannot write workspace-map.md: ${error.message}`);
  }

  return {
    status: "success",
    members: memberRows,
    artifacts,
    warnings: exploreWarnings,
  };
}

module.exports = {
  classifyMember,
  explore,
};
