"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");

function runStep(name, args) {
  process.stdout.write(`\n==> ${name}\n`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    process.stderr.write(`${name} failed to start: ${result.error.message}\n`);
    process.exit(result.status || 1);
  }
  if (result.status !== 0) {
    process.stderr.write(`${name} failed with exit code ${result.status}\n`);
    process.exit(result.status || 1);
  }
}

// The claude profile validates with the external `claude` CLI, which is not
// guaranteed in CI. Probe for it so check.js can validate claude when present
// and fall back to generation-only (still exercising the transform) otherwise.
function claudeCliAvailable() {
  for (const bin of ["claude", "claude.cmd", "claude.exe"]) {
    const probe = spawnSync(bin, ["--version"], { stdio: "ignore", shell: false });
    if (!probe.error) {
      return true;
    }
  }
  return false;
}

function generateTarget(target, validate) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), `ospec-${target}-`));
  try {
    const args = ["scripts/configure/cli.js", "--target", target, "--source", ROOT, "--out", outDir];
    if (!validate) {
      args.push("--no-validate");
    }
    const label = validate ? `Generate + validate ${target}` : `Generate ${target} (validation skipped)`;
    runStep(label, args);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

function main() {
  runStep("Native Node tests", ["--test", "scripts/**/*.test.js"]);

  const claudeOk = claudeCliAvailable();
  if (!claudeOk) {
    process.stdout.write("\n(note) claude CLI not found — generating the claude target without its validator.\n");
  }

  // github-copilot always validates (local node validator); vscode is an identity
  // transform with no validator; claude validates only when its CLI is installed.
  const targets = [
    { target: "claude", validate: claudeOk },
    { target: "vscode", validate: false },
    { target: "github-copilot", validate: true },
  ];

  for (const { target, validate } of targets) {
    generateTarget(target, validate);
  }

  process.stdout.write("\nAll checks passed.\n");
}

if (require.main === module) {
  main();
}

module.exports = { main, runStep };
