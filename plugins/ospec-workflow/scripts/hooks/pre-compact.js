#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  createArtifactStoreFromConfig,
} = require("../lib/artifact-store.js");
const { resolveWorkspaceCwd } = require("../lib/pathsafe.js");

const PHASE_RANKS = new Map([
  ["explore", 1],
  ["exploration", 1],
  ["propose", 2],
  ["proposal", 2],
  ["spec", 3],
  ["specs", 3],
  ["design", 3],
  ["tasks", 4],
  ["apply", 5],
  ["verify", 6],
  ["archive", 7],
]);

const ARTIFACT_CANDIDATES = [
  { relativePath: "exploration.md", rank: 1 },
  { relativePath: "proposal-lite.md", rank: 2 },
  { relativePath: "proposal.md", rank: 2 },
  { relativePath: "design.md", rank: 3 },
  { relativePath: "tasks.md", rank: 4 },
  { relativePath: "apply-progress.md", rank: 5 },
  { relativePath: "verify-report.md", rank: 6 },
  { relativePath: "archive-report.md", rank: 7 },
];

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseScalar(value) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseYamlLines(content) {
  return content
    .split(/\r?\n/)
    .map((raw) => ({
      indent: raw.match(/^\s*/)[0].length,
      content: raw.trim(),
    }))
    .filter((line) => line.content && !line.content.startsWith("#"));
}

function extractScalarAtPath(content, expectedPath) {
  const stack = [];

  for (const line of parseYamlLines(content)) {
    if (line.content.startsWith("- ")) {
      continue;
    }

    const match = line.content.match(/^([^:]+):(?:\s*(.*))?$/);

    if (!match) {
      continue;
    }

    while (stack.length && stack[stack.length - 1].indent >= line.indent) {
      stack.pop();
    }

    const key = match[1].trim();
    const value = match[2] || "";
    const currentPath = [...stack.map((entry) => entry.key), key];

    if (
      currentPath.length === expectedPath.length &&
      currentPath.every((part, index) => part === expectedPath[index]) &&
      value
    ) {
      return parseScalar(value);
    }

    if (!value) {
      stack.push({ indent: line.indent, key });
    }
  }

  return "";
}

function extractFirstScalar(content, paths) {
  for (const expectedPath of paths) {
    const value = extractScalarAtPath(content, expectedPath);

    if (value) {
      return value;
    }
  }

  return "";
}

function extractTopLevelSection(content, sectionName) {
  const lines = content.split(/\r?\n/);
  const section = [];
  let sectionIndent = -1;
  let collecting = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!collecting) {
      if (
        indent === 0 &&
        new RegExp(`^${sectionName}:\\s*(?:#.*)?$`).test(trimmed)
      ) {
        collecting = true;
        sectionIndent = indent;
      }
      continue;
    }

    if (trimmed && indent <= sectionIndent) {
      break;
    }

    section.push(raw);
  }

  return section;
}

function extractListSection(content, sectionName) {
  const section = extractTopLevelSection(content, sectionName);
  const values = [];
  let current = null;
  let itemIndent = null;

  for (const raw of section) {
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

      const item = trimmed.slice(2).trim();
      const field = item.match(/^([^:]+):\s*(.*)$/);

      if (field) {
        current = { [field[1].trim()]: parseScalar(field[2]) };
        values.push(current);
      } else {
        current = null;
        values.push(parseScalar(item));
      }
      continue;
    }

    if (
      current &&
      typeof current === "object" &&
      itemIndent !== null &&
      indent === itemIndent + 2
    ) {
      const field = trimmed.match(/^([^:]+):\s*(.*)$/);

      if (field) {
        current[field[1].trim()] = parseScalar(field[2]);
      }
    }
  }

  return values;
}

function normalizePhase(value) {
  return String(value || "")
    .replace(/^sdd-/, "")
    .trim()
    .toLowerCase();
}

async function findActiveChange(workspace, mode) {
  const store = await createArtifactStoreFromConfig({ mode, workspace });

  return (await store.findActiveChanges())[0] || null;
}

async function collectSpecArtifacts(changeDirectory) {
  const specsRoot = path.join(changeDirectory, "specs");
  const artifacts = [];

  async function visit(directory) {
    let entries;

    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(absolutePath);
      } else if (entry.isFile() && entry.name === "spec.md") {
        artifacts.push({
          relativePath: toPortablePath(
            path.relative(changeDirectory, absolutePath),
          ),
          rank: 3,
        });
      }
    }
  }

  await visit(specsRoot);
  return artifacts.sort((left, right) =>
    compareStrings(left.relativePath, right.relativePath),
  );
}

async function pathIsFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function inferLastCompletedArtifact(workspace, activeChange, phase) {
  const explicitPath = extractFirstScalar(activeChange.content, [
    ["runtime", "last_completed_artifact"],
    ["last_completed_artifact"],
  ]);

  if (explicitPath) {
    return toPortablePath(explicitPath);
  }

  const currentRank = PHASE_RANKS.get(normalizePhase(phase)) || Infinity;
  const candidates = [
    ...ARTIFACT_CANDIDATES,
    ...(await collectSpecArtifacts(activeChange.changeDirectory)),
  ];
  const existing = [];

  for (const candidate of candidates) {
    if (
      candidate.rank < currentRank &&
      (await pathIsFile(
        path.join(activeChange.changeDirectory, candidate.relativePath),
      ))
    ) {
      existing.push(candidate);
    }
  }

  existing.sort(
    (left, right) =>
      right.rank - left.rank ||
      compareStrings(right.relativePath, left.relativePath),
  );

  if (!existing.length) {
    return "None";
  }

  return toPortablePath(
    path.relative(
      workspace,
      path.join(activeChange.changeDirectory, existing[0].relativePath),
    ),
  );
}

function formatBlockers(content) {
  for (const sectionName of ["blocking_questions", "blockers"]) {
    const values = extractListSection(content, sectionName);

    if (values.length) {
      return values.map((value) => {
        if (typeof value === "string") {
          return value;
        }

        return (
          value.question ||
          value.message ||
          value.reason ||
          value.id ||
          JSON.stringify(value)
        );
      });
    }

    const scalar = extractFirstScalar(content, [[sectionName]]);

    if (scalar && scalar.toLowerCase() !== "none") {
      return [scalar];
    }
  }

  return [];
}

function formatApprovals(content) {
  return extractListSection(content, "approvals").map((approval) => {
    if (typeof approval === "string") {
      return approval;
    }

    const gate = approval.gate || approval.id || "approval";
    const decision = approval.decision || approval.status || "recorded";

    return `${gate}: ${decision}`;
  });
}

function formatNextAction(value, changeName) {
  const next = String(value || "").trim();

  if (!next) {
    return `Run \`sdd-continue ${changeName}\`.`;
  }

  if (next.toLowerCase() === "none") {
    return "None.";
  }

  if (/^\/?sdd-[a-z-]+$/i.test(next)) {
    return `Run \`${next.replace(/^\//, "")} ${changeName}\`.`;
  }

  return next.endsWith(".") ? next : `${next}.`;
}

function renderList(values) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- None";
}

function renderSummary({
  approvals,
  blockers,
  changeName,
  currentPhase,
  lastCompletedArtifact,
  nextAction,
}) {
  return [
    "# Session Summary",
    "",
    "## Active change",
    `\`${changeName}\``,
    "",
    "## Current phase",
    `\`${currentPhase || "unknown"}\``,
    "",
    "## Last completed artifact",
    `\`${lastCompletedArtifact}\``,
    "",
    "## Blocking decisions",
    renderList(blockers),
    "",
    "## Approvals",
    renderList(approvals),
    "",
    "## Next recommended action",
    nextAction,
    "",
  ].join("\n");
}

async function runPreCompact({
  input = {},
  fallbackCwd = process.cwd(),
  mode,
} = {}) {
  const workspace = resolveWorkspaceCwd(input.cwd, fallbackCwd);
  const store = await createArtifactStoreFromConfig({ mode, workspace });
  const activeChange = (await store.findActiveChanges())[0] || null;

  if (!activeChange) {
    return { status: "skipped", reason: "no-active-change" };
  }

  const changeName =
    extractFirstScalar(activeChange.content, [["change", "name"]]) ||
    activeChange.directoryName;
  const currentPhase = extractFirstScalar(activeChange.content, [
    ["change", "current_phase"],
    ["current_phase"],
    ["phase"],
  ]);
  const lastCompletedArtifact = await inferLastCompletedArtifact(
    workspace,
    activeChange,
    currentPhase,
  );
  const summary = renderSummary({
    approvals: formatApprovals(activeChange.content),
    blockers: formatBlockers(activeChange.content),
    changeName,
    currentPhase,
    lastCompletedArtifact,
    nextAction: formatNextAction(
      extractFirstScalar(activeChange.content, [["next_recommended"]]),
      changeName,
    ),
  });
  const writeResult = await store.writeSessionSummary(
    activeChange.directoryName,
    summary,
  );

  return {
    status: writeResult.status,
    change: changeName,
    path: writeResult.path,
  };
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

async function main() {
  try {
    await runPreCompact({ input: await readJsonInput() });
    process.stdout.write('{"continue":true}\n');
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        continue: true,
        systemMessage: `PreCompact could not persist the session summary: ${error.message}`,
      })}\n`,
    );
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  extractFirstScalar,
  extractListSection,
  findActiveChange,
  formatNextAction,
  renderSummary,
  runPreCompact,
};
