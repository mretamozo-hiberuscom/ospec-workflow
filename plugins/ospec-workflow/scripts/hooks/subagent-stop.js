#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const {
  ARTIFACT_STORE_RELATIVE_PATHS,
  createArtifactStoreFromConfig,
} = require("../lib/artifact-store.js");
const { validatePath, resolveWorkspaceCwd } = require("../lib/pathsafe.js");

const EVENT_RELATIVE_PATH = ARTIFACT_STORE_RELATIVE_PATHS.runtimeEvents;
const RESULT_FIELDS = [
  "result",
  "output",
  "response",
  "final_output",
  "final_result",
  "message",
  "content",
];

function normalizeResolution(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isDegradedResolution(resolution) {
  return ["fallback-registry", "fallback-path", "none"].includes(resolution);
}

function findStructuredResolution(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return "";
  }

  seen.add(value);

  if (Object.prototype.hasOwnProperty.call(value, "skill_resolution")) {
    const resolution = normalizeResolution(value.skill_resolution);

    if (resolution) {
      return resolution;
    }
  }

  const nestedValues = Array.isArray(value)
    ? [...value].reverse()
    : Object.values(value).reverse();

  for (const nestedValue of nestedValues) {
    const resolution = findStructuredResolution(nestedValue, seen);

    if (resolution) {
      return resolution;
    }
  }

  return "";
}

function parseJsonText(text) {
  const trimmed = text.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function findTextResolution(text) {
  const parsed = parseJsonText(text);

  if (parsed) {
    const structured = findStructuredResolution(parsed);

    if (structured) {
      return structured;
    }
  }

  const matches = [
    ...text.matchAll(
      /(?:["'`]?skill_resolution["'`]?)\s*[:=]\s*["'`]?([a-z-]+)["'`]?/gi,
    ),
  ];

  return matches.length
    ? normalizeResolution(matches[matches.length - 1][1])
    : "";
}

function findResolutionInValue(value) {
  if (typeof value === "string") {
    return findTextResolution(value);
  }

  return findStructuredResolution(value);
}

function findResolutionInInput(input) {
  const direct = normalizeResolution(input?.skill_resolution);

  if (direct) {
    return direct;
  }

  for (const field of RESULT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(input || {}, field)) {
      continue;
    }

    const resolution = findResolutionInValue(input[field]);

    if (resolution) {
      return resolution;
    }
  }

  return "";
}

function findResolutionInJsonLines(content) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim());

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const parsed = parseJsonText(lines[index]);

    if (!parsed) {
      continue;
    }

    const resolution = findStructuredResolution(parsed);

    if (resolution) {
      return resolution;
    }

    for (const field of RESULT_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(parsed, field)) {
        continue;
      }

      const nestedResolution = findResolutionInValue(parsed[field]);

      if (nestedResolution) {
        return nestedResolution;
      }
    }
  }

  return "";
}

async function findResolutionInTranscript(transcriptPath) {
  // Reject relative paths, ".." traversal, and filesystem roots before any read
  // (parity with internal/hooks/subagentstop.go). A rejected path is treated as
  // absent — identical degradation to ENOENT.
  const { cleaned, ok } = validatePath(transcriptPath);
  if (!ok) {
    return "";
  }

  try {
    const content = await fs.readFile(cleaned, "utf8");
    const parsed = parseJsonText(content);

    if (parsed) {
      return findStructuredResolution(parsed);
    }

    return findResolutionInJsonLines(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EACCES") {
      return "";
    }

    throw error;
  }
}

function resolveAgentName(input) {
  return String(
    input?.agent_type ||
      input?.agent_name ||
      input?.agent ||
      input?.agent_id ||
      "unknown",
  );
}

function resolveTimestamp(input, now) {
  const timestamp =
    typeof input?.timestamp === "string" ? input.timestamp.trim() : "";

  return timestamp || now().toISOString();
}

async function runSubagentStop({
  input = {},
  fallbackCwd = process.cwd(),
  mode,
  now = () => new Date(),
} = {}) {
  const workspace = resolveWorkspaceCwd(input.cwd, fallbackCwd);
  const resolution =
    findResolutionInInput(input) ||
    (await findResolutionInTranscript(input.transcript_path));

  if (!isDegradedResolution(resolution)) {
    return {
      status: "skipped",
      reason: resolution ? "healthy-resolution" : "resolution-unavailable",
    };
  }

  const event = {
    timestamp: resolveTimestamp(input, now),
    agent: resolveAgentName(input),
    skill_resolution: resolution,
    action: "refresh-registry-next-delegation",
  };

  const store = await createArtifactStoreFromConfig({ mode, workspace });
  await store.appendRuntimeEvent(event);

  return {
    status: "warning-recorded",
    path: EVENT_RELATIVE_PATH,
    event,
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
    const result = await runSubagentStop({
      input: await readJsonInput(),
    });

    process.stdout.write(
      `${JSON.stringify(
        result.status === "warning-recorded"
          ? {
              continue: true,
              systemMessage:
                "Subagent skill resolution degraded; refresh the skill registry before the next delegation.",
            }
          : { continue: true },
      )}\n`,
    );
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        continue: true,
        systemMessage: `SubagentStop observability failed: ${error.message}`,
      })}\n`,
    );
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  EVENT_RELATIVE_PATH,
  findResolutionInInput,
  findResolutionInJsonLines,
  findResolutionInTranscript,
  findStructuredResolution,
  findTextResolution,
  isDegradedResolution,
  runSubagentStop,
};
