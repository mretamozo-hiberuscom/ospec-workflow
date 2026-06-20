#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  calculateFingerprint,
  discoverSkills,
  readRegistryCache,
  writeRegistryCache,
} = require("../lib/skill-registry.js");
const { readBaselineState } = require("../lib/ospec-state.js");
const {
  parseCapabilities,
  capabilityNames,
} = require("../lib/capability-registry.js");
const {
  ARTIFACT_STORE_RELATIVE_PATHS,
  createArtifactStoreFromConfig,
} = require("../lib/artifact-store.js");
const { resolveWorkspaceCwd } = require("../lib/pathsafe.js");

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

  return result;
}

function checkUnignoredEnvFiles(workspace, gitignoreLines, alerts) {
  const envFiles = [".env", ".env.local", ".env.development", ".env.production", ".npmrc"];
  for (const f of envFiles) {
    if (fs.existsSync(path.join(workspace, f))) {
      const ignored = gitignoreLines.some(line => line === f || line.includes(f));
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
