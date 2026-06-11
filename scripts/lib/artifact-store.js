"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

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
    async findActiveChanges() {
      const openspecRoot = await ospec.findOpenSpecRoot(workspace);
      return ospec.findActiveChanges(openspecRoot);
    },
  };
}

function createWorkspaceFederatedStore(workspace) {
  const base = createCoordinatorSurface(workspace);
  const atlasPath = path.join(workspace, "openspec", "workspace.yaml");

  async function loadAtlas() {
    try {
      return atlas.parseAtlas(await fs.readFile(atlasPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  return {
    mode: "workspace-federated",
    ...base,
    async isInitialized() {
      const parsed = await loadAtlas();
      return Boolean(parsed && parsed.members.length > 0);
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
} = {}) {
  if (!ARTIFACT_STORE_MODES.includes(mode)) {
    throw new Error(
      `Unknown artifact store mode "${mode}". ` +
        `Expected one of: ${ARTIFACT_STORE_MODES.join(", ")}.`,
    );
  }

  const resolvedWorkspace = path.resolve(workspace);

  if (mode === "workspace-federated") {
    return createWorkspaceFederatedStore(resolvedWorkspace);
  }

  return createOpenSpecStore(resolvedWorkspace);
}

// Resolve the backend from openspec/config.yaml (coordinator-local, identical
// across modes), then build the matching store. An explicit `mode` overrides the
// config — used by tests. Unknown/absent config falls back to openspec.
async function createArtifactStoreFromConfig({
  workspace = process.cwd(),
  mode,
} = {}) {
  const resolvedWorkspace = path.resolve(workspace);

  if (mode) {
    return createArtifactStore({ mode, workspace: resolvedWorkspace });
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
  });
}

module.exports = {
  ARTIFACT_STORE_MODES,
  ARTIFACT_STORE_RELATIVE_PATHS,
  DEFAULT_ARTIFACT_STORE_MODE,
  createArtifactStore,
  createArtifactStoreFromConfig,
};
