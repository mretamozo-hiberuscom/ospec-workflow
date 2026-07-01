#!/usr/bin/env node

"use strict";

// Launcher for the ospec-hooks runtime. Claude Code (and the other targets)
// invoke this once per hook event, with the plugin root expanded by the host:
//
//   node <plugin-root>/scripts/hooks/ospec-hooks-launch.js <subcommand>
//
// It prefers the compiled Go binary (fast, single native process) and falls
// back to the committed Node hook of the same name when no binary ships for the
// host platform. This keeps hooks working on every install channel:
//   - the marketplace `release` branch bundles per-platform binaries in
//     scripts/hooks/ (see .github/workflows/publish-marketplace.yml);
//   - local `copyBinaryToTree` drops a generic ospec-hooks[.exe];
//   - opencode places the binary in release/dist/;
//   - if none is present, the Node fallback (<subcommand>.js) still runs.
//
// The launcher is deliberately a .js file so the configure pipeline ships it
// automatically (gatherRuntimeScripts seeds scripts/hooks/*.js) and so it is
// immune to the shebang / CRLF / exec-bit hazards a shell launcher hits on
// Windows — the very failure mode this fix removes.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SUBCOMMANDS = new Set([
  "session-start",
  "pre-tool-use",
  "pre-compact",
  "subagent-stop",
  "stop",
]);

// Non-blocking sentinel: never fail a hook (and thus the session) because of a
// launcher-level problem. Every Node hook already returns this on its own error
// path, so emitting it here keeps the contract consistent.
const CONTINUE = '{"continue":true}\n';

// node platform/arch -> Go GOOS/GOARCH + executable extension, matching the
// names produced by build-hooks.yml and install-target.js (hostBinarySuffix).
function hostBinarySuffix(platform = process.platform, arch = process.arch) {
  const goos =
    platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : "linux";
  const goarch = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : arch;
  const ext = platform === "win32" ? ".exe" : "";
  return { goos, goarch, ext };
}

// Candidate binary paths, most specific first:
//   1. per-platform name in scripts/hooks/  (release bundle)
//   2. per-platform name in release/dist/   (opencode binary location)
//   3. generic name in scripts/hooks/       (local copyBinaryToTree)
function binaryCandidates(scriptDir, suffix = hostBinarySuffix()) {
  const { goos, goarch, ext } = suffix;
  const platformName = `ospec-hooks-${goos}-${goarch}${ext}`;
  const genericName = `ospec-hooks${ext}`;
  return [
    path.join(scriptDir, platformName),
    // plugin-root/release/dist (where opencode's resolveBinary looks first).
    path.join(scriptDir, "..", "..", "release", "dist", platformName),
    path.join(scriptDir, genericName),
  ];
}

const FEDERATION_AWARE_HOOKS = new Set([
  "session-start",
  "pre-compact",
  "stop",
]);

function readBackendModeSync(configPath, readFileSync = fs.readFileSync) {
  try {
    const content = readFileSync(configPath, "utf8");
    let inArtifactStore = false;
    for (const raw of content.split(/\r?\n/)) {
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
          return match[1].replace(/^(["'])([\s\S]*)\1$/, "$2").replace(/\s+#.*$/, "").trim();
        }
      }
    }
  } catch (err) {
    // Ignore and default
  }
  return "openspec";
}

function resolveBinary(scriptDir, suffix = hostBinarySuffix(), exists = fs.existsSync) {
  for (const candidate of binaryCandidates(scriptDir, suffix)) {
    if (exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Resolve what to run and how. Pure so it can be unit-tested without spawning:
// returns { command, args } for either the native binary or the Node fallback.
function resolveInvocation(sub, scriptDir, suffix = hostBinarySuffix(), exists = fs.existsSync, readFileSync = fs.readFileSync) {
  if (FEDERATION_AWARE_HOOKS.has(sub)) {
    const configPath = path.join(process.cwd(), "openspec", "config.yaml");
    if (exists(configPath)) {
      const mode = readBackendModeSync(configPath, readFileSync);
      if (mode === "workspace-federated") {
        return { command: process.execPath, args: [path.join(scriptDir, `${sub}.js`)] };
      }
    }
  }

  const binary = resolveBinary(scriptDir, suffix, exists);
  if (binary) {
    return { command: binary, args: [sub] };
  }
  return { command: process.execPath, args: [path.join(scriptDir, `${sub}.js`)] };
}


function main(argv, scriptDir = __dirname) {
  const sub = argv[0];
  if (!SUBCOMMANDS.has(sub)) {
    process.stderr.write(`ospec-hooks-launch: unknown subcommand '${sub || ""}'\n`);
    process.stdout.write(CONTINUE);
    return 0;
  }

  const { command, args } = resolveInvocation(sub, scriptDir);
  // stdio:inherit hands the child the original hook payload on stdin and pipes
  // its result straight back to Claude Code; the launcher reads nothing itself.
  const result = spawnSync(command, args, { stdio: "inherit" });

  if (result.error) {
    process.stdout.write(CONTINUE);
    return 0;
  }
  return result.status == null ? 0 : result.status;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  SUBCOMMANDS,
  hostBinarySuffix,
  binaryCandidates,
  resolveBinary,
  resolveInvocation,
  main,
};
