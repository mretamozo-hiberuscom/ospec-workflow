#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  calculateFingerprint,
  discoverSkills,
  readRegistryCache,
  writeRegistryCache,
} = require("../lib/skill-registry.js");
const { readBaselineState, detectSpecDrift } = require("../lib/ospec-state.js");
const {
  parseCapabilities,
  capabilityNames,
} = require("../lib/capability-registry.js");
const {
  ARTIFACT_STORE_RELATIVE_PATHS,
  createArtifactStoreFromConfig,
} = require("../lib/artifact-store.js");
const { resolveWorkspaceCwd } = require("../lib/pathsafe.js");
const { resolveGitState, composeAdvisory } = require("./lib/git-state.js");

const CACHE_VERSION = 2;
const CACHE_RELATIVE_PATH = ARTIFACT_STORE_RELATIVE_PATHS.cache;

function buildBaselineHint(baselineState) {
  if (!baselineState) {
    return null;
  }

  const { status, domains_pending, stale_domains } = baselineState;

  if (status === "pending") {
    return "Baseline not started. Run /sdd-baseline to seed openspec/specs/.";
  }

  if (status === "partial") {
    const count = domains_pending.length;
    return `Baseline partial: ${count} domain(s) pending. Run /sdd-baseline to resume.`;
  }

  if (stale_domains.length > 0) {
    const list = stale_domains.join(", ");
    return `Baseline done but ${stale_domains.length} domain(s) stale: ${list}. Run /sdd-baseline refresh to update.`;
  }

  return null;
}

// Builds a workspace-scoped git runner so git commands run in the detected
// workspace directory instead of the process cwd (relevant when the test
// fixture is a temp dir). Accepts the per-call `timeoutMs` passed by
// resolveGitState/detectSpecDrift, which enforce a single shared 5 s deadline
// across their probes (mirrors Go's context.WithTimeout approach in
// gitstate.go). Shared by the git-collaboration advisory and the spec-drift
// advisory — both hook paths need the same "run git in `workspace`" runner.
function createWorkspaceGitRunner(workspace) {
  return function workspaceGitRunner(args, timeoutMs) {
    return execFileSync("git", args, {
      timeout: typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 5000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      cwd: workspace,
    });
  };
}

function resolveWorkspace(input, fallbackCwd) {
  const inputCwd = input && typeof input === "object" ? input.cwd : undefined;
  return resolveWorkspaceCwd(inputCwd, fallbackCwd);
}

async function runSessionStart({
  input = {},
  fallbackCwd = process.cwd(),
  pluginRoot = path.resolve(__dirname, "../.."),
  mode,
  now = () => new Date(),
  gitRunner = undefined,
} = {}) {
  const workspace = resolveWorkspace(input, fallbackCwd);
  const store = await createArtifactStoreFromConfig({ mode, workspace });
  const cachePath = store.cachePath();
  const ospecDetected = await store.isInitialized();

  if (!ospecDetected) {
    return {
      status: "ok",
      ospecDetected: false,
      registry: {
        status: "skipped",
        path: store.cacheRelativePath,
      },
    };
  }

  let baselineHint = null;
  let activeCapabilities = [];
  try {
    const configContent = await store.readConfig();
    if (configContent !== null) {
      baselineHint = buildBaselineHint(readBaselineState(configContent));
      const parsedCaps = parseCapabilities(configContent);
      activeCapabilities = capabilityNames(parsedCaps);
    }
  } catch {
    // Baseline state read failure must not break session start
  }

  const registry = await discoverSkills(pluginRoot);
  const fingerprint = await calculateFingerprint(registry.fingerprintPaths);
  const currentCache = await readRegistryCache(cachePath);

  // Report whether the cache was reused (fingerprint hit, no write) or
  // generated (created/refreshed). Callers use this to tell a cheap cache hit
  // from real regeneration work instead of conflating both as "fresh".
  const cacheHit =
    currentCache?.version === CACHE_VERSION &&
    currentCache.fingerprint === fingerprint;

  const registryResult = {
    status: cacheHit ? "reused" : "generated",
    path: store.cacheRelativePath,
  };

  if (!cacheHit) {
    const cache = {
      version: CACHE_VERSION,
      fingerprint,
      generated_at: now().toISOString(),
      skills: registry.skills,
    };
    // v2: federate the workspace shape into the cache (null in single-repo mode).
    const workspaceContext = await store.describeWorkspace();
    if (workspaceContext) {
      cache.workspace = workspaceContext;
    }
    await writeRegistryCache(cachePath, cache);
  }

  const result = { status: "ok", ospecDetected: true, registry: registryResult };
  if (baselineHint !== null) {
    result.baseline = { hint: baselineHint };
  }

  if (activeCapabilities.length > 0) {
    result.capabilities = activeCapabilities;
  }

  if (process.env.DISABLE_AGENT_SHIELD !== "true") {
    const alerts = [];
    let gitignoreContent = "";
    try {
      gitignoreContent = fs.readFileSync(path.join(workspace, ".gitignore"), "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") {
        console.error(`Warning: failed to read .gitignore: ${e.message}`);
      }
    }

    const gitignoreLines = gitignoreContent
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));

    checkUnignoredEnvFiles(workspace, gitignoreLines, alerts);
    checkEmbeddedCredentials(workspace, alerts);

    if (alerts.length > 0) {
      result.security = {
        status: "warning",
        alerts
      };

      const fileAlerts = alerts.map(a => `${a.file} (${a.reason})`).join(", ");
      result.systemMessage = `Cuidado: Se detectaron riesgos de seguridad en la inicialización: ${fileAlerts}. Por favor asegúrate de corregirlos.`;
    }
  }

  // Git collaboration advisory — checked after the security block.
  // Omitted entirely when the bypass env var is set or when both conditions
  // are absent (clean feature branch).
  if (process.env.DISABLE_GIT_COLLABORATION_GUARD !== "true") {
    // Use the injected runner (for tests) or the shared workspace-scoped default.
    const resolvedGitRunner = gitRunner || createWorkspaceGitRunner(workspace);
    const gitState = resolveGitState(resolvedGitRunner);
    const onDefault =
      gitState.defaultBranch !== null &&
      gitState.currentBranch !== null &&
      gitState.defaultBranch === gitState.currentBranch;
    if (onDefault || gitState.dirty === true) {
      const advisory = composeAdvisory(
        onDefault,
        gitState.dirty,
        gitState.currentBranch
      );
      result.gitCollaboration = {
        status: "warning",
        currentBranch: gitState.currentBranch,
        defaultBranch: gitState.defaultBranch,
        // dirtyTree is OMITTED when the status probe failed (dirty === null)
        // so we never falsely report "clean".
        ...(gitState.dirty !== null && { dirtyTree: gitState.dirty }),
        message: advisory,
      };
      result.systemMessage = result.systemMessage
        ? result.systemMessage + "\n" + advisory
        : advisory;
    }
  }

  // Spec drift advisory — additive, after the git-collaboration block.
  // Independently gated by DISABLE_SPEC_DRIFT_GUARD (single kill switch for
  // both this SessionStart summary and PreToolUse's Step 5c, same precedent
  // as DISABLE_GIT_COLLABORATION_GUARD covering two hook paths). Wrapped so a
  // manifest/git failure can never break session start.
  if (process.env.DISABLE_SPEC_DRIFT_GUARD !== "true") {
    try {
      const driftRunner = gitRunner || createWorkspaceGitRunner(workspace);
      const drift = detectSpecDrift({ workspace, gitRunner: driftRunner });

      if (drift) {
        result.specDrift = {
          status: "warning",
          domains: drift.domains.map((d) => ({
            domain: d.domain,
            sinceCommit: d.sinceCommit,
            message: `El dominio '${d.domain}' ha derivado desde ${d.sinceCommit}. Considera ejecutar /sdd-reconcile ${d.domain}.`,
          })),
        };

        const names = drift.domains.map((d) => d.domain).join(", ");
        const line = `Deriva de especificación en: ${names}. Considera ejecutar /sdd-reconcile.`;
        result.systemMessage = result.systemMessage
          ? result.systemMessage + "\n" + line
          : line;
      }
    } catch {
      // Drift detection must never break session start.
    }
  }

  return result;
}

function matchGitignorePattern(line, file) {
  if (line === file || line === '/' + file || line === file + '/') {
    return true;
  }
  if (line.includes('*')) {
    const escaped = line.replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
    try {
      if (new RegExp('^' + escaped + '$').test(file)) return true;
    } catch {
      // An invalid .gitignore glob produces a malformed RegExp.
      // Treat it as no-match so the caller sees the file as un-ignored
      // (the safer direction: the user will be warned rather than silently
      // skipped). No debug log is emitted here because matchGitignorePattern
      // is called in a tight loop per file and the pattern source is always
      // the .gitignore content the user wrote.
    }
    const escapedNoSlash = line.replace(/^\//, '').replace(/[-\/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*');
    try {
      if (new RegExp('^' + escapedNoSlash + '$').test(file)) return true;
    } catch {
      // Same rationale as above: malformed pattern → no-match fallback.
    }
  }
  return false;
}

function checkUnignoredEnvFiles(workspace, gitignoreLines, alerts) {
  const envFiles = [".env", ".env.local", ".env.development", ".env.production", ".npmrc"];
  for (const f of envFiles) {
    if (fs.existsSync(path.join(workspace, f))) {
      const ignored = gitignoreLines.some(line => matchGitignorePattern(line, f));
      if (!ignored) {
        alerts.push({
          type: "unignored-env-file",
          file: f,
          reason: "El archivo sensible no está ignorado en Git"
        });
      }
    }
  }
}

function checkEmbeddedCredentials(workspace, alerts) {
  const gitConfigPath = path.join(workspace, ".git", "config");
  if (fs.existsSync(gitConfigPath)) {
    try {
      const gitConfigContent = fs.readFileSync(gitConfigPath, "utf8");
      if (/https?:\/\/[^/:\s]+:[^/:\s]+@/.test(gitConfigContent)) {
        alerts.push({
          type: "embedded-credentials",
          file: ".git/config",
          reason: "El archivo contiene credenciales en texto plano"
        });
      }
    } catch (e) {
      if (e.code !== "ENOENT") {
        console.error(`Warning: failed to read .git/config: ${e.message}`);
      }
    }
  }
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
    const result = await runSessionStart({
      input: await readJsonInput(),
    });

    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        status: "error",
        message: error.message,
      })}\n`,
    );
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  CACHE_RELATIVE_PATH,
  runSessionStart,
};
