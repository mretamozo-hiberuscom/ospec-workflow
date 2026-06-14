"use strict";

// One-shot, idempotent installer for the local Claude Code marketplace. Builds
// the marketplace from canonical source, then registers it and the plugin via
// the `claude` CLI. Safe to re-run: it ADDS the marketplace/plugin the first
// time and UPDATES them on every subsequent run, so the same command serves
// both first-time setup and day-to-day iteration.
//
// Usage:
//   node scripts/configure/install-claude.js            # build + add/update + install/update
//   node scripts/configure/install-claude.js --build-only  # build only (use /reload-plugins in-session)
//
// Why a wrapper: the README dance was five manual commands (build, two validate
// calls, Resolve-Path + marketplace add, install). The build already runs the
// strict plugin validation, and add/install are one-time — this collapses the
// whole thing to a single re-runnable command. See README "Claude Code".

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { buildClaudeMarketplace } = require("./claude-marketplace.js");
const { copyBinaryToTree } = require("./install-target.js");

const MARKETPLACE = "ospec-tools";
const PLUGIN = "ospec-workflow";

// Resolve the claude binary name once. On Windows the launcher is claude.cmd;
// spawnSync with shell:false will not find a bare `claude` for a .cmd shim.
function resolveClaudeBin() {
  for (const bin of ["claude", "claude.cmd", "claude.exe"]) {
    const probe = spawnSync(bin, ["--version"], { stdio: "ignore", shell: false });
    if (!probe.error) return bin;
  }
  return null;
}

function run(bin, args) {
  process.stdout.write(`\n==> ${bin} ${args.join(" ")}\n`);
  const result = spawnSync(bin, args, { stdio: "inherit", shell: false });
  return result.status === 0;
}

// Capture stdout to decide add-vs-update / install-vs-update without parsing
// exit codes (which conflate "absent" with real failures).
function listOutput(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", shell: false });
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function main(argv) {
  const buildOnly = argv.includes("--build-only");

  const build = buildClaudeMarketplace({
    source: process.cwd(),
    out: path.join("dist", "claude-marketplace"),
    validate: true,
    marketplaceName: MARKETPLACE,
    pluginName: PLUGIN,
  });

  process.stdout.write(`claude marketplace -> ${build.outDir}\n`);
  if (build.validation?.stdout) process.stdout.write(build.validation.stdout);
  if (build.validation?.stderr) process.stderr.write(build.validation.stderr);

  if (build.exitCode !== 0) {
    process.stderr.write("\nbuild/validation failed; not touching marketplace state\n");
    process.exitCode = build.exitCode;
    return;
  }

  // Copy the platform-appropriate ospec-hooks binary into the Claude plugin tree
  // (scripts/hooks/). Best-effort: warns and skips if the binary is absent.
  copyBinaryToTree(build.pluginDir, "claude", process.cwd());

  if (buildOnly) {
    process.stdout.write("\nBuilt. Run /reload-plugins in your Claude Code session to apply.\n");
    return;
  }

  const bin = resolveClaudeBin();
  if (!bin) {
    process.stdout.write(
      "\n'claude' CLI not found on PATH; marketplace not (re)registered.\n" +
        `Built artifact is ready at ${build.outDir}.\n`,
    );
    return;
  }

  // Marketplace: add the first time, refresh on every subsequent run.
  if (listOutput(bin, ["plugin", "marketplace", "list"]).includes(MARKETPLACE)) {
    run(bin, ["plugin", "marketplace", "update", MARKETPLACE]);
  } else {
    run(bin, ["plugin", "marketplace", "add", build.outDir, "--scope", "user"]);
  }

  // Plugin: install the first time, update on every subsequent run. Both the
  // detection and the update use the qualified `name@marketplace` id — the bare
  // name is ambiguous to the CLI and `plugin update <name>` reports "not found".
  const pluginId = `${PLUGIN}@${MARKETPLACE}`;
  if (listOutput(bin, ["plugin", "list"]).includes(pluginId)) {
    run(bin, ["plugin", "update", pluginId]);
  } else {
    run(bin, ["plugin", "install", pluginId]);
  }

  process.stdout.write("\nDone. Restart Claude Code or run /reload-plugins to apply.\n");
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { main, resolveClaudeBin };
