"use strict";

// Build + sync installer for the targets that have NO plugin marketplace:
// opencode and github-copilot. Unlike Claude Code (register marketplace +
// `plugin install`), these tools consume the workflow by having the generated
// tree copied into the ROOT of a destination repo, where they auto-discover it
// (.opencode/ + opencode.json for opencode; .github/ + .mcp.json for copilot).
//
// This collapses "build to dist/, then copy the right folders by hand" into one
// command:
//   node scripts/configure/install-target.js opencode <destRepo>
//   node scripts/configure/install-target.js github-copilot <destRepo>
//
// Copy semantics: overwrite. Generated entries are copied over the destination,
// replacing files of the same path; unrelated files in the destination are left
// untouched. Pass --dry-run to preview without writing.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { runConfigure } = require("./cli.js");

const TARGETS = new Set(["opencode", "github-copilot"]);

// Detect the host platform suffix used in CI-compiled binary names.
function hostBinarySuffix() {
  const p = process.platform;
  const a = process.arch;
  const goos = p === "win32" ? "windows" : p === "darwin" ? "darwin" : "linux";
  const arch = a === "x64" ? "amd64" : a === "arm64" ? "arm64" : a;
  const ext = p === "win32" ? ".exe" : "";
  return { os: goos, arch, ext };
}

// Copy the platform-appropriate ospec-hooks binary into the generated output
// tree. For claude/vscode/github-copilot the binary lands in scripts/hooks/;
// for opencode it lands in release/dist/ (where the plugin's resolveBinary()
// looks first). If the source binary is absent (pre-CI dev environment),
// print a warning and skip without failing.
function copyBinaryToTree(outDir, target, sourceDir) {
  const { os: goos, arch, ext } = hostBinarySuffix();
  const srcBin = path.join(sourceDir, "release", "dist", `ospec-hooks-${goos}-${arch}${ext}`);

  if (!fs.existsSync(srcBin)) {
    process.stderr.write(
      `[warn] ospec-hooks binary not found at ${srcBin}; skipping copy.\n` +
        `       Run the CI build (build-hooks.yml) or 'go build -o release/dist/ospec-hooks-${goos}-${arch}${ext} ./cmd/ospec-hooks' first.\n`,
    );
    return;
  }

  // Destination paths differ per target:
  //   opencode   -> release/dist/ospec-hooks[.exe]  (plugin resolveBinary priority 1)
  //   everything -> scripts/hooks/ospec-hooks[.exe]  (CLAUDE_PLUGIN_ROOT-relative shell hook)
  const destinations = [];
  if (target === "opencode") {
    destinations.push(path.join(outDir, "release", "dist", `ospec-hooks${ext}`));
  } else {
    destinations.push(path.join(outDir, "scripts", "hooks", `ospec-hooks${ext}`));
  }

  for (const dest of destinations) {
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(srcBin, dest);
      // Set executable bit on POSIX systems so the shell can invoke the binary.
      if (process.platform !== "win32") {
        fs.chmodSync(dest, 0o755);
      }
      process.stdout.write(`  + ospec-hooks${ext} -> ${path.relative(outDir, dest)}\n`);
    } catch (err) {
      process.stderr.write(`[warn] failed to copy binary to ${dest}: ${err.message}. Continuing sync.\n`);
    }
  }
}

function parseArgs(argv) {
  const args = { dryRun: false, validate: true };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-validate") args.validate = false;
    else if (arg === "--source") args.source = argv[++i];
    else positional.push(arg);
  }
  [args.target, args.dest] = positional;
  return args;
}

// Refuse to copy a generated tree on top of paths we must never clobber: the
// filesystem root, the home dir, and — critically — the source repo itself.
// The copilot tree carries `.github/` and `scripts/`, so syncing into our own
// repo would overwrite the real harness. Compare resolved paths.
function assertSafeDest(destDir, sourceDir) {
  const abs = path.resolve(destDir);
  const refuse = (reason) => {
    throw new Error(`refusing to sync into ${abs}: ${reason}`);
  };

  let canonicalAbs = abs;
  let canonicalSrc = path.resolve(sourceDir);
  try {
    canonicalAbs = fs.realpathSync(abs);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  try {
    canonicalSrc = fs.realpathSync(canonicalSrc);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }

  const isCaseInsensitive = process.platform === "win32" || process.platform === "darwin";

  // Enforce safety checks on canonical paths to prevent symlink bypasses
  if (canonicalAbs === path.parse(canonicalAbs).root) refuse("filesystem root");
  const home = os.homedir();
  if (home) {
    let canonicalHome = path.resolve(home);
    try {
      canonicalHome = fs.realpathSync(canonicalHome);
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const equalsHome = isCaseInsensitive
      ? canonicalAbs.toLowerCase() === canonicalHome.toLowerCase()
      : canonicalAbs === canonicalHome;
    if (equalsHome) refuse("home directory");
  }

  const equalsSrc = isCaseInsensitive
    ? canonicalAbs.toLowerCase() === canonicalSrc.toLowerCase()
    : canonicalAbs === canonicalSrc;

  if (equalsSrc) {
    refuse("equals the source repo (would overwrite the harness)");
  }

  // Prevent directory recursion or nested overwrites
  const relative = path.relative(canonicalSrc, canonicalAbs);
  const isDescendant = relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (isDescendant) {
    refuse("inside the source repository (nested target write)");
  }

  const relativeBack = path.relative(canonicalAbs, canonicalSrc);
  const isAncestor = relativeBack && !relativeBack.startsWith("..") && !path.isAbsolute(relativeBack);
  if (isAncestor) {
    refuse("contains the source repository (would overwrite the harness root)");
  }
}

function main(argv) {
  const args = parseArgs(argv);
  const sourceDir = path.resolve(args.source || process.cwd());

  if (!TARGETS.has(args.target) || !args.dest) {
    process.stderr.write(
      "usage: install-target <opencode|github-copilot> <destRepo> [--dry-run] [--no-validate]\n" +
        "  e.g. npm run install:opencode -- ../my-project\n",
    );
    process.exitCode = 2;
    return;
  }

  const destDir = path.resolve(args.dest);
  assertSafeDest(destDir, sourceDir);
  if (!fs.existsSync(destDir) || !fs.statSync(destDir).isDirectory()) {
    process.stderr.write(`destination is not an existing directory: ${destDir}\n`);
    process.exitCode = 2;
    return;
  }

  // Build into dist/<target>. The opencode/copilot validators are pure Node, so
  // validation is safe to run here (no external CLI needed, unlike claude).
  const outDir = path.join(sourceDir, "dist", args.target);
  const result = runConfigure({ sourceDir, target: args.target, outDir, validate: args.validate });

  if (result.validation?.stdout) process.stdout.write(result.validation.stdout);
  if (result.validation?.stderr) process.stderr.write(result.validation.stderr);
  if (result.exitCode !== 0) {
    process.stderr.write("\nbuild/validation failed; nothing synced\n");
    process.exitCode = result.exitCode;
    return;
  }

  // Copy the platform binary into the generated tree before syncing. This is
  // best-effort: if the binary is absent (pre-CI dev), a warning is printed and
  // the rest of the sync proceeds normally.
  copyBinaryToTree(outDir, args.target, sourceDir);

  // Copy each top-level generated entry (including dotfiles) into the dest root,
  // overwriting same-path files. force:true replaces; recursive walks dirs.
  const entries = fs.readdirSync(outDir);
  process.stdout.write(`\n${args.dryRun ? "[dry-run] would sync" : "sync"} ${outDir} -> ${destDir}\n`);
  for (const entry of entries) {
    const src = path.join(outDir, entry);
    const dst = path.join(destDir, entry);
    process.stdout.write(`  ${args.dryRun ? "·" : "+"} ${entry}\n`);
    if (!args.dryRun) {
      fs.cpSync(src, dst, { recursive: true, force: true });
    }
  }

  if (args.dryRun) {
    process.stdout.write("\n[dry-run] no files written.\n");
  } else {
    process.stdout.write(`\nDone. ${args.target} workflow synced into ${destDir}.\n`);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = { main, assertSafeDest, parseArgs, copyBinaryToTree };
