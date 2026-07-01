"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
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

// Applies one indent-2 baseline field line to result and returns the list key
// that subsequent list items belong to (or null for scalar / non-list fields).
function applyBaselineField(trimmed, result) {
  const inlineEmptyList = trimmed.match(/^(\w+):\s*\[\]$/);
  if (inlineEmptyList && BASELINE_LIST_KEYS.has(inlineEmptyList[1])) {
    result[inlineEmptyList[1]] = [];
    return null;
  }

  const keyValue = trimmed.match(/^(\w+):\s*(.*)$/);
  if (!keyValue) {
    return null;
  }

  const key = keyValue[1];
  const rawValue = keyValue[2].trim();
  if (BASELINE_LIST_KEYS.has(key) && rawValue === "") {
    result[key] = [];
    return key;
  }
  if (BASELINE_SCALAR_KEYS.has(key)) {
    result[key] = parseScalar(rawValue);
  }
  return null;
}

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
      currentListKey = applyBaselineField(trimmed, result);
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
async function reclaimStaleLock(lockPath, staleMs) {
  // A crashed writer can orphan the lock. Reclaim it once it is older than the
  // staleness window so contention recovers automatically instead of every
  // subsequent append bypassing the lock forever.
  try {
    const { mtimeMs } = await fs.stat(lockPath);
    if (Date.now() - mtimeMs > staleMs) {
      await fs.rm(lockPath, { force: true });
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function withAppendLock(eventPath, run, { retries = 100, delayMs = 15, staleMs = 10000 } = {}) {
  const lockPath = `${eventPath}.lock`;
  for (let attempt = 0; ; attempt += 1) {
    let handle;
    try {
      handle = await fs.open(lockPath, "wx");
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }
      await reclaimStaleLock(lockPath, staleMs);
      if (attempt >= retries) {
        // Still contended after reclamation attempts: proceed best-effort rather
        // than lose the event (still better than no lock at all).
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

/**
 * detectSpecDrift / readStagedFiles / matchesGlobs — domain-drift primitives.
 *
 * detectSpecDrift mirrors resolveGitState (scripts/hooks/lib/git-state.js):
 * synchronous, fail-safe per probe (a git failure skips that domain instead of
 * throwing), and bounded by one shared deadline split across all per-domain
 * probes. Both SessionStart and PreToolUse call it additively — PreToolUse
 * also calls readStagedFiles to intersect the drifted domains against staged
 * files, since hooks are stateless per-invocation processes.
 */

const DRIFT_TIMEOUT_MS = 5000;
const DOMAIN_MAP_BULLET_RE = /^-\s*([\w-]+):\s*(.*)$/;
const DOMAIN_MAP_SOURCES_RE = /\|\s*sources:\s*(.+)$/;
const ENTRIES_HEADING_RE = /entries/i;

/** Escapes one character for literal inclusion in a RegExp source string. */
function escapeGlobLiteral(char) {
  return /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char;
}

/**
 * Converts one glob pattern into an anchored RegExp.
 * `**` -> any run of characters, including path separators (any depth).
 * `*`  -> any run of characters EXCLUDING path separators (one segment).
 * Everything else is matched literally.
 */
function globToRegExp(glob) {
  const normalized = String(glob).replace(/\\/g, "/").trim();
  let pattern = "";

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];

    if (char === "*" && normalized[i + 1] === "*") {
      pattern += ".*";
      i += 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else {
      pattern += escapeGlobLiteral(char);
    }
  }

  return new RegExp(`^${pattern}$`);
}

/**
 * @param {string} file - a repo-relative path (as returned by `git diff --name-only`)
 * @param {string[]} globs
 * @returns {boolean} true when `file` matches at least one glob
 */
function matchesGlobs(file, globs) {
  if (!Array.isArray(globs) || globs.length === 0) {
    return false;
  }

  const normalizedFile = String(file).replace(/\\/g, "/");

  return globs.some((glob) => globToRegExp(glob).test(normalizedFile));
}

/**
 * Parses `openspec/specs/_baseline/manifest.md` into its two lookups:
 *   sources: domain -> string[] (from the Domain Map's `sources:` bullets)
 *   entries: domain -> { status, batch, commit, timestamp } (latest row wins,
 *            since the Entries table is an append-only log — later physical
 *            rows for the same domain overwrite earlier ones as we scan top
 *            to bottom)
 *
 * @param {string} content
 * @returns {{ sources: Map<string, string[]>, entries: Map<string, {status:string, batch:string, commit:string, timestamp:string}> }}
 */
function parseManifest(content) {
  const sources = new Map();
  const entries = new Map();
  let inEntriesSection = false;

  for (const raw of String(content).split(/\r?\n/)) {
    const trimmed = raw.trim();

    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("#")) {
      inEntriesSection = ENTRIES_HEADING_RE.test(trimmed);
      continue;
    }

    if (!inEntriesSection) {
      const bulletMatch = trimmed.match(DOMAIN_MAP_BULLET_RE);
      const sourcesMatch = bulletMatch && bulletMatch[2].match(DOMAIN_MAP_SOURCES_RE);

      if (sourcesMatch) {
        sources.set(
          bulletMatch[1],
          sourcesMatch[1]
            .split(",")
            .map((glob) => glob.trim())
            .filter(Boolean),
        );
      }

      continue;
    }

    if (!trimmed.startsWith("|")) {
      continue;
    }

    const cells = trimmed.split("|").slice(1, -1).map((cell) => cell.trim());

    if (cells.length !== 5) {
      continue;
    }

    const [domain, status, batch, commit, timestamp] = cells;

    if (domain.toLowerCase() === "domain" || /^-+$/.test(domain)) {
      continue; // header row or markdown separator row
    }

    entries.set(domain, { status, batch, commit, timestamp });
  }

  return { sources, entries };
}

/**
 * Lists the baseline domain names already covered by an active (non-terminal)
 * OpenSpec change's declared `specs/{domain}/` scope. Sync fs, fail-open to an
 * empty set on any read error (missing `changes/`, unreadable state.yaml, ...).
 *
 * @param {string} openspecRoot
 * @returns {Set<string>}
 */
function findSuppressedDomainsSync(openspecRoot) {
  const suppressed = new Set();
  const changesRoot = path.join(openspecRoot, "changes");
  let entries;

  try {
    entries = fsSync.readdirSync(changesRoot, { withFileTypes: true });
  } catch (_e) {
    return suppressed;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "archive") {
      continue;
    }

    const changeDir = path.join(changesRoot, entry.name);
    let stateContent;

    try {
      stateContent = fsSync.readFileSync(path.join(changeDir, "state.yaml"), "utf8");
    } catch (_e) {
      continue;
    }

    if (TERMINAL_STATUSES.has(readStatus(stateContent).toLowerCase())) {
      continue;
    }

    let specEntries;

    try {
      specEntries = fsSync.readdirSync(path.join(changeDir, "specs"), { withFileTypes: true });
    } catch (_e) {
      continue;
    }

    for (const specEntry of specEntries) {
      if (specEntry.isDirectory()) {
        suppressed.add(specEntry.name);
      }
    }
  }

  return suppressed;
}

/**
 * Default gitRunner: delegates to execFileSync("git", args, { cwd: workspace, ... }).
 * Throws on non-zero exit, timeout, or binary not found — callers must catch.
 */
function defaultDriftGitRunner(workspace) {
  return function runner(args, timeoutMs) {
    return execFileSync("git", args, {
      cwd: workspace,
      timeout: typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : DRIFT_TIMEOUT_MS,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  };
}

function parseGitFileList(output) {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Reads the currently staged files via `git diff --name-only --cached`.
 * Fail-safe: any git failure returns null instead of throwing, so a caller
 * can treat it as "no staged-file data" (best-effort empty overlap).
 *
 * @param {function} gitRunner - (args: string[], timeoutMs?: number) => string
 * @param {number} [timeoutMs]
 * @returns {string[]|null}
 */
function readStagedFiles(gitRunner, timeoutMs) {
  const runner = typeof gitRunner === "function" ? gitRunner : defaultDriftGitRunner(process.cwd());

  try {
    return parseGitFileList(runner(["diff", "--name-only", "--cached"], timeoutMs));
  } catch (_e) {
    return null;
  }
}

/**
 * Synchronous. Never throws — git/manifest failure yields null or fewer domains.
 *
 * @param {object} [options]
 * @param {string} [options.workspace]
 * @param {function} [options.gitRunner] - (args: string[], timeoutMs?: number) => string
 * @param {number} [options.timeoutMs]
 * @returns {null | { status: "warning", domains: Array<{domain:string, sinceCommit:string, sources:string[], files:string[]}> }}
 */
function detectSpecDrift(options = {}) {
  const { workspace = process.cwd(), gitRunner, timeoutMs = DRIFT_TIMEOUT_MS } = options;
  const resolvedWorkspace = path.resolve(workspace);
  const openspecRoot = path.join(resolvedWorkspace, "openspec");

  let baseline;

  try {
    const configContent = fsSync.readFileSync(path.join(openspecRoot, "config.yaml"), "utf8");
    baseline = readBaselineState(configContent);
  } catch (_e) {
    return null;
  }

  if (!baseline || !Array.isArray(baseline.domains_done) || baseline.domains_done.length === 0) {
    return null;
  }

  let manifest;

  try {
    const manifestContent = fsSync.readFileSync(
      path.join(openspecRoot, "specs", "_baseline", "manifest.md"),
      "utf8",
    );
    manifest = parseManifest(manifestContent);
  } catch (_e) {
    return null;
  }

  const suppressed = findSuppressedDomainsSync(openspecRoot);
  const runner = typeof gitRunner === "function" ? gitRunner : defaultDriftGitRunner(resolvedWorkspace);
  const budget = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : DRIFT_TIMEOUT_MS;
  const deadline = Date.now() + budget;

  function remaining() {
    return Math.max(1, deadline - Date.now());
  }

  const domains = [];

  for (const domain of baseline.domains_done) {
    if (suppressed.has(domain)) {
      continue;
    }

    const entry = manifest.entries.get(domain);
    const domainSources = manifest.sources.get(domain);

    if (!entry || !entry.commit || !Array.isArray(domainSources) || domainSources.length === 0) {
      continue;
    }

    let changedFiles;

    try {
      const output = runner(["diff", "--name-only", `${entry.commit}..HEAD`], remaining());
      changedFiles = parseGitFileList(output);
    } catch (_e) {
      continue; // fail-safe: git failure (bad hash, detached HEAD, missing binary, ...) skips this domain
    }

    const files = changedFiles.filter((file) => matchesGlobs(file, domainSources));

    if (files.length > 0) {
      domains.push({ domain, sinceCommit: entry.commit, sources: domainSources, files });
    }
  }

  return domains.length > 0 ? { status: "warning", domains } : null;
}

module.exports = {
  RUNTIME_EVENT_RELATIVE_PATH,
  appendRuntimeEvent,
  detectSpecDrift,
  findActiveChanges,
  findOpenSpecRoot,
  matchesGlobs,
  readBackendMode,
  readBaselineState,
  readStagedFiles,
  readState,
  writeSessionSummary,
};
