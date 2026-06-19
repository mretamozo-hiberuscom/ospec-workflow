"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ospec = require("./ospec-state.js");
const atlas = require("./workspace-atlas.js");
const {
  ARTIFACT_STORE_MODES,
  DEFAULT_ARTIFACT_STORE_MODE,
} = require("./artifact-store-modes.js");

// Single source of truth for the on-disk layout. Hooks MUST resolve every path
// through a store instead of hardcoding these literals, so a second backend
// (e.g. workspace-federated) only has to provide its own layout + resolvers.
const DERIVED_LAYOUT = {
  cache: ".ospec/cache/skill-registry.cache.json",
  sessionDir: ".ospec/session",
  latest: ".ospec/session/latest.md",
  // Owned by the openspec backend; referenced here so there is one source.
  runtimeEvents: ospec.RUNTIME_EVENT_RELATIVE_PATH,
  sessionSummaryFile: "session-summary.md",
};

// Mode-independent derived relative paths. Hooks re-export these so the harness
// never hardcodes the .ospec/ layout in more than one place.
const ARTIFACT_STORE_RELATIVE_PATHS = Object.freeze({
  cache: DERIVED_LAYOUT.cache,
  latestSession: DERIVED_LAYOUT.latest,
  runtimeEvents: DERIVED_LAYOUT.runtimeEvents,
});

const CANONICAL_LAYOUT = {
  root: "openspec",
  config: "openspec/config.yaml",
  changesDir: "openspec/changes",
};

function toRelativeSegments(relativePath) {
  return relativePath.split("/");
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

// Operations that only touch the workspace-local derived layout (.ospec/...).
// These are identical across every mode, so both adapters share them.
function createDerivedSurface(workspace) {
  const resolveDerived = (relativePath) =>
    path.join(workspace, ...toRelativeSegments(relativePath));

  return {
    cacheRelativePath: DERIVED_LAYOUT.cache,
    latestSessionRelativePath: DERIVED_LAYOUT.latest,
    runtimeEventRelativePath: DERIVED_LAYOUT.runtimeEvents,
    cachePath: () => resolveDerived(DERIVED_LAYOUT.cache),
    latestSessionPath: () => resolveDerived(DERIVED_LAYOUT.latest),
    runtimeEventPath: () => resolveDerived(DERIVED_LAYOUT.runtimeEvents),
    sessionSummaryPath: (changeName) =>
      path.join(
        workspace,
        ...toRelativeSegments(DERIVED_LAYOUT.sessionDir),
        changeName,
        DERIVED_LAYOUT.sessionSummaryFile,
      ),
    appendRuntimeEvent: (event) =>
      ospec.appendRuntimeEvent({ workspace, ...event }),
  };
}

// Coordinator-local surface shared by every mode: the config, change directory,
// session summary, and the derived .ospec/ layout always resolve against the
// coordinator workspace. Modes differ only in isInitialized + findActiveChanges.
function createCoordinatorSurface(workspace) {
  const derived = createDerivedSurface(workspace);
  const configPath = () =>
    path.join(workspace, ...toRelativeSegments(CANONICAL_LAYOUT.config));
  const changeDirectory = (changeName) =>
    path.join(
      workspace,
      ...toRelativeSegments(CANONICAL_LAYOUT.changesDir),
      changeName,
    );

  return {
    workspace,
    ...derived,
    configPath,
    changeDirectory,
    async readConfig() {
      try {
        return await fs.readFile(configPath(), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") {
          return null;
        }

        throw error;
      }
    },
    writeSessionSummary: (changeName, content) =>
      ospec.writeSessionSummary(changeDirectory(changeName), content),
  };
}

function createOpenSpecStore(workspace) {
  const base = createCoordinatorSurface(workspace);

  return {
    mode: "openspec",
    ...base,
    isInitialized: () => pathExists(base.configPath()),
    // Single-repo backend: no federated workspace context to surface.
    describeWorkspace: async () => null,
    async findActiveChanges() {
      const openspecRoot = await ospec.findOpenSpecRoot(workspace);
      return ospec.findActiveChanges(openspecRoot);
    },
  };
}

function createWorkspaceFederatedStore(workspace, { execGitSync = spawnSync } = {}) {
  const base = createCoordinatorSurface(workspace);
  const atlasPath = path.join(workspace, "openspec", "workspace.yaml");

  // The atlas cache is corrupt when a non-empty file does not contain
  // recognizable YAML structure. `parseAtlas` is intentionally lenient (never
  // throws), so both garbage AND valid-but-empty content parse to empty
  // collections. Discriminate by checking for structural section headers:
  // a file with `members:` or `contracts:` at column 0 is structurally valid
  // (even if those sections are empty), while garbage text is not.
  function isCorruptCache(content) {
    if (!content.trim()) {
      return false;
    }

    const hasStructure =
      /^members:/m.test(content) || /^contracts:/m.test(content);

    return !hasStructure;
  }

  async function regenerateAtlas() {
    const scanned = await atlas.scanMemberMarkers(workspace);
    const markers = scanned
      .filter((entry) => entry.marker)
      .map((entry) => entry.marker);
    const { atlas: regenerated } = atlas.mergeMarkersIntoAtlas(markers);

    await fs.mkdir(path.dirname(atlasPath), { recursive: true });
    await fs.writeFile(atlasPath, atlas.serializeAtlas(regenerated));

    return regenerated;
  }

  // Warn-on-detect only: the derived cache must not be tracked by git. Fail-open
  // when git is absent or errors (e.g. outside a repository); never mutate git.
  function warnIfGitTracked() {
    try {
      const result = execGitSync("git", ["ls-files", "openspec/workspace.yaml"], {
        cwd: workspace,
        encoding: "utf8",
      });

      if (result.status === 0 && result.stdout && result.stdout.trim()) {
        console.warn(
          'openspec/workspace.yaml is a derived cache but is tracked by git. ' +
            'Run "git rm --cached openspec/workspace.yaml" to untrack it.',
        );
      }
    } catch {
      // git unavailable or failed — migration detection is best-effort.
    }
  }

  async function loadAtlas() {
    let content;

    try {
      content = await fs.readFile(atlasPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        const regenerated = await regenerateAtlas();

        warnIfGitTracked();
        return regenerated;
      }

      throw error;
    }

    let parsed = atlas.parseAtlas(content);

    if (isCorruptCache(content)) {
      console.warn(
        "openspec/workspace.yaml is corrupt; regenerating it from member markers.",
      );
      parsed = await regenerateAtlas();
    }

    warnIfGitTracked();
    return parsed;
  }

  return {
    mode: "workspace-federated",
    ...base,
    async isInitialized() {
      const parsed = await loadAtlas();
      return Boolean(parsed && parsed.members.length > 0);
    },
    // Federated workspace shape (members + contracts) for the v2 registry cache,
    // so a delegator reads cross-repo context without re-parsing workspace.yaml.
    // Sorted by id for a deterministic cache.
    async describeWorkspace() {
      const parsed = await loadAtlas();
      if (!parsed || parsed.members.length === 0) {
        return null;
      }

      const members = (await atlas.resolveMembers(workspace, parsed))
        .map((member) => ({ id: member.id, reachable: member.reachable }))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

      const contracts = parsed.contracts
        .map((contract) => ({
          id: contract.id,
          provider: contract.provider,
          consumers: contract.consumers || [],
        }))
        .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

      return { members, contracts };
    },
    async findActiveChanges() {
      const parsed = (await loadAtlas()) || { members: [], contracts: [] };
      const aggregated = [];
      const warnings = [];

      const coordinatorRoot = await ospec.findOpenSpecRoot(workspace);
      for (const change of await ospec.findActiveChanges(coordinatorRoot)) {
        aggregated.push({ ...change, source: "." });
      }

      for (const member of await atlas.resolveMembers(workspace, parsed)) {
        if (!member.reachable) {
          warnings.push({ member: member.id, reason: "unreachable" });
          continue;
        }

        for (const change of await ospec.findActiveChanges(member.root)) {
          aggregated.push({ ...change, source: member.id });
        }
      }

      // Hooks consume [0] as the active change, so order the union by recency
      // across every source (newest first), tie-breaking by directory name.
      aggregated.sort(
        (left, right) =>
          right.modifiedAt - left.modifiedAt ||
          (left.directoryName < right.directoryName ? -1 : 1),
      );

      // Skips are non-fatal observability, exposed without disturbing the array.
      Object.defineProperty(aggregated, "warnings", {
        value: warnings,
        enumerable: false,
      });

      return aggregated;
    },
  };
}

function createArtifactStore({
  mode = DEFAULT_ARTIFACT_STORE_MODE,
  workspace = process.cwd(),
  execGitSync,
} = {}) {
  if (!ARTIFACT_STORE_MODES.includes(mode)) {
    throw new Error(
      `Unknown artifact store mode "${mode}". ` +
        `Expected one of: ${ARTIFACT_STORE_MODES.join(", ")}.`,
    );
  }

  const resolvedWorkspace = path.resolve(workspace);

  if (mode === "workspace-federated") {
    return createWorkspaceFederatedStore(
      resolvedWorkspace,
      execGitSync ? { execGitSync } : undefined,
    );
  }

  return createOpenSpecStore(resolvedWorkspace);
}

// Resolve the backend from openspec/config.yaml (coordinator-local, identical
// across modes), then build the matching store. An explicit `mode` overrides the
// config — used by tests. Unknown/absent config falls back to openspec.
async function createArtifactStoreFromConfig({
  workspace = process.cwd(),
  mode,
  execGitSync,
} = {}) {
  const resolvedWorkspace = path.resolve(workspace);

  if (mode) {
    return createArtifactStore({ mode, workspace: resolvedWorkspace, execGitSync });
  }

  const config = await createArtifactStore({
    workspace: resolvedWorkspace,
  }).readConfig();
  const resolvedMode = config
    ? ospec.readBackendMode(config)
    : DEFAULT_ARTIFACT_STORE_MODE;

  return createArtifactStore({
    mode: resolvedMode,
    workspace: resolvedWorkspace,
    execGitSync,
  });
}

module.exports = {
  ARTIFACT_STORE_MODES,
  ARTIFACT_STORE_RELATIVE_PATHS,
  DEFAULT_ARTIFACT_STORE_MODE,
  createArtifactStore,
  createArtifactStoreFromConfig,
};
