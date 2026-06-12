"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  ARTIFACT_STORE_MODES,
  DEFAULT_ARTIFACT_STORE_MODE,
} = require("./artifact-store-modes.js");

const TERMINAL_STATUSES = new Set([
  "archived",
  "closed",
  "complete",
  "completed",
  "done",
]);
const RUNTIME_EVENT_RELATIVE_PATH =
  ".ospec/runtime/subagent-events.jsonl";

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
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function readStatus(content) {
  const lines = content.split(/\r?\n/);
  let inChange = false;
  let topLevelStatus = "";

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (indent === 0) {
      inChange = trimmed === "change:";

      const match = trimmed.match(/^status:\s*(.+)$/);

      if (match) {
        topLevelStatus = parseScalar(match[1]).toLowerCase();
      }

      continue;
    }

    if (inChange) {
      const nestedStatus = trimmed.match(/^status:\s*(.+)$/);

      if (nestedStatus) {
        return parseScalar(nestedStatus[1]).toLowerCase();
      }
    }
  }

  return topLevelStatus;
}

const BASELINE_LIST_KEYS = new Set(["domains_pending", "domains_done", "stale_domains"]);
const BASELINE_SCALAR_KEYS = new Set(["status", "last_checked"]);
const BASELINE_TOP_KEY = "baseline:";
const BASELINE_FIELD_INDENT = 2;
const BASELINE_LIST_ITEM_INDENT = 4;

function readBaselineState(content) {
  const lines = content.split(/\r?\n/);
  let foundBaseline = false;
  let inBaseline = false;
  let currentListKey = null;
  const result = {
    status: "",
    domains_pending: [],
    domains_done: [],
    stale_domains: [],
    last_checked: "",
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (indent === 0) {
      inBaseline = trimmed === BASELINE_TOP_KEY;
      if (inBaseline) {
        foundBaseline = true;
      }
      currentListKey = null;
      continue;
    }

    if (!inBaseline) {
      continue;
    }

    if (indent === BASELINE_FIELD_INDENT) {
      currentListKey = null;

      const inlineEmptyList = trimmed.match(/^(\w+):\s*\[\]$/);
      if (inlineEmptyList && BASELINE_LIST_KEYS.has(inlineEmptyList[1])) {
        result[inlineEmptyList[1]] = [];
        continue;
      }

      const keyValue = trimmed.match(/^(\w+):\s*(.*)$/);
      if (keyValue) {
        const key = keyValue[1];
        const rawValue = keyValue[2].trim();

        if (BASELINE_LIST_KEYS.has(key) && rawValue === "") {
          currentListKey = key;
          result[key] = [];
        } else if (BASELINE_SCALAR_KEYS.has(key)) {
          result[key] = parseScalar(rawValue);
        }
      }
    } else if (indent >= BASELINE_LIST_ITEM_INDENT && currentListKey !== null) {
      const listItem = trimmed.match(/^-\s+(.+)$/);
      if (listItem) {
        result[currentListKey].push(listItem[1].trim());
      }
    }
  }

  return foundBaseline ? result : null;
}

function readBackendMode(content) {
  let inArtifactStore = false;

  for (const raw of String(content).split(/\r?\n/)) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (indent === 0) {
      inArtifactStore = trimmed === "artifact_store:";
      continue;
    }

    if (inArtifactStore) {
      const match = trimmed.match(/^backend:\s*(.+)$/);

      if (match) {
        const mode = parseScalar(match[1]);

        return ARTIFACT_STORE_MODES.includes(mode)
          ? mode
          : DEFAULT_ARTIFACT_STORE_MODE;
      }
    }
  }

  return DEFAULT_ARTIFACT_STORE_MODE;
}

function resolveWorkspaceFromChange(changePath) {
  const absoluteChangePath = path.resolve(changePath);
  const changesPath = path.dirname(absoluteChangePath);
  const openspecRoot = path.dirname(changesPath);

  if (
    path.basename(changesPath) !== "changes" ||
    path.basename(openspecRoot) !== "openspec"
  ) {
    throw new Error(
      `Change path must match <workspace>/openspec/changes/<change>: ${changePath}`,
    );
  }

  return path.dirname(openspecRoot);
}

async function findOpenSpecRoot(workspace) {
  const openspecRoot = path.join(path.resolve(workspace), "openspec");

  try {
    const stats = await fs.stat(openspecRoot);
    return stats.isDirectory() ? openspecRoot : null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readState(changePath) {
  const resolvedPath = path.resolve(changePath);
  const statePath =
    path.basename(resolvedPath).toLowerCase() === "state.yaml"
      ? resolvedPath
      : path.join(resolvedPath, "state.yaml");

  try {
    const [content, stats] = await Promise.all([
      fs.readFile(statePath, "utf8"),
      fs.stat(statePath),
    ]);
    const changeDirectory = path.dirname(statePath);

    return {
      changePath: changeDirectory,
      changeDirectory,
      directoryName: path.basename(changeDirectory),
      statePath,
      content,
      status: readStatus(content),
      modifiedAt: stats.mtimeMs,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function findActiveChanges(openspecRoot) {
  if (!openspecRoot) {
    return [];
  }

  const changesRoot = path.join(path.resolve(openspecRoot), "changes");
  let entries;

  try {
    entries = await fs.readdir(changesRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const states = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "archive")
      .map((entry) => readState(path.join(changesRoot, entry.name))),
  );

  return states
    .filter(
      (state) => state && !TERMINAL_STATUSES.has(state.status.toLowerCase()),
    )
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt ||
        compareStrings(left.directoryName, right.directoryName),
    );
}

async function writeSessionSummary(changePath, summary) {
  const absoluteChangePath = path.resolve(changePath);
  const workspace = resolveWorkspaceFromChange(absoluteChangePath);
  const summaryPath = path.join(
    workspace,
    ".ospec",
    "session",
    path.basename(absoluteChangePath),
    "session-summary.md",
  );

  try {
    if ((await fs.readFile(summaryPath, "utf8")) === summary) {
      return {
        status: "fresh",
        path: toPortablePath(path.relative(workspace, summaryPath)),
        absolutePath: summaryPath,
      };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });

  const temporaryPath = `${summaryPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    await fs.writeFile(temporaryPath, summary, "utf8");
    await fs.rename(temporaryPath, summaryPath);
  } finally {
    try {
      await fs.rm(temporaryPath, { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return {
    status: "written",
    path: toPortablePath(path.relative(workspace, summaryPath)),
    absolutePath: summaryPath,
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Serialize appends across processes with an advisory lock. fs.appendFile is not
// a guaranteed-atomic cross-process operation (notably on Windows), so parallel
// sub-agents firing subagent-stop at once could interleave or drop JSONL lines.
// Exclusive-create ("wx") of a sibling .lock file IS atomic on every platform, so
// holding it around the append makes each line a clean, complete write.
async function withAppendLock(eventPath, run, { retries = 100, delayMs = 15 } = {}) {
  const lockPath = `${eventPath}.lock`;
  for (let attempt = 0; ; attempt += 1) {
    let handle;
    try {
      handle = await fs.open(lockPath, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      if (attempt >= retries) {
        // A crashed writer can orphan the lock. Rather than lose the event after
        // ~1.5s of contention, proceed best-effort (still better than no lock).
        return run();
      }
      await sleep(delayMs);
      continue;
    }
    try {
      return await run();
    } finally {
      await handle.close();
      await fs.rm(lockPath, { force: true });
    }
  }
}

async function appendRuntimeEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("Runtime event must be an object.");
  }

  const workspace = path.resolve(event.workspace || event.cwd || process.cwd());
  const eventPath = path.join(
    workspace,
    ...RUNTIME_EVENT_RELATIVE_PATH.split("/"),
  );
  const serializedEvent = { ...event };

  delete serializedEvent.workspace;
  delete serializedEvent.cwd;

  await fs.mkdir(path.dirname(eventPath), { recursive: true });
  await withAppendLock(eventPath, () =>
    fs.appendFile(eventPath, `${JSON.stringify(serializedEvent)}\n`, "utf8"),
  );

  return {
    path: RUNTIME_EVENT_RELATIVE_PATH,
    absolutePath: eventPath,
    event: serializedEvent,
  };
}

module.exports = {
  RUNTIME_EVENT_RELATIVE_PATH,
  appendRuntimeEvent,
  findActiveChanges,
  findOpenSpecRoot,
  readBackendMode,
  readBaselineState,
  readState,
  writeSessionSummary,
};
