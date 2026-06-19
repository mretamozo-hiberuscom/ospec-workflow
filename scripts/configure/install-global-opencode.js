"use strict";

// Idempotent installer to register the ospec-workflow globally under ~/.config/opencode/
// directory. Builds the opencode target, copies agents, commands, instructions,
// plugins, and skills to the global directories, and merges the MCP config.
//
// Usage:
//   node scripts/configure/install-global-opencode.js

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");

function main() {
  const sourceDir = path.resolve(__dirname, "..", "..");
  const home = os.homedir();
  const globalDir = path.join(home, ".config", "opencode");

  if (!fs.existsSync(globalDir)) {
    process.stderr.write(`Global OpenCode configuration directory not found at ${globalDir}\n`);
    process.exitCode = 1;
    return;
  }

  // 1. Build the target opencode to dist/opencode
  const outDir = path.join(sourceDir, "dist", "opencode");
  const result = runConfigure({ sourceDir, target: "opencode", outDir, validate: true });
  if (result.exitCode !== 0) {
    process.stderr.write("\nBuild/validation failed; aborting global install\n");
    process.exitCode = result.exitCode;
    return;
  }

  // Copy compiler hooks binary if present in release/dist/
  copyBinaryToTree(outDir, "opencode", sourceDir);

  process.stdout.write(`\nInstalling globally to ${globalDir}...\n`);

  // Helper to copy files recursively and preserve directory tree structure
  const copyFolder = (src, dest) => {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyFolder(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
        process.stdout.write(`  + ${path.relative(globalDir, destPath)}\n`);
      }
    }
  };

  // 2. Copy remapped folders
  copyFolder(path.join(outDir, ".opencode", "agents"), path.join(globalDir, "agents"));
  copyFolder(path.join(outDir, ".opencode", "commands"), path.join(globalDir, "commands"));
  copyFolder(path.join(outDir, ".opencode", "instructions"), path.join(globalDir, "instructions"));
  copyFolder(path.join(outDir, ".opencode", "plugins"), path.join(globalDir, "plugins"));
  copyFolder(path.join(outDir, "skills"), path.join(globalDir, "skills"));
  copyFolder(path.join(outDir, "scripts"), path.join(globalDir, "scripts"));

  if (fs.existsSync(path.join(outDir, "release"))) {
    copyFolder(path.join(outDir, "release"), path.join(globalDir, "release"));
  }

  // 3. Merge opencode.json configurations
  const globalConfigPath = path.join(globalDir, "opencode.json");
  const generatedConfigPath = path.join(outDir, "opencode.json");

  let globalConfig = {};
  if (fs.existsSync(globalConfigPath)) {
    try {
      globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, "utf8"));
    } catch (err) {
      process.stderr.write(`Warning: Failed to parse existing global opencode.json: ${err.message}\n`);
    }
  }

  const generatedConfig = JSON.parse(fs.readFileSync(generatedConfigPath, "utf8"));

  // Merge MCP servers
  globalConfig.mcp = globalConfig.mcp || {};
  for (const [key, value] of Object.entries(generatedConfig.mcp || {})) {
    globalConfig.mcp[key] = value;
  }

  // Merge instructions glob (modified for global scope: instructions/*.md)
  globalConfig.instructions = globalConfig.instructions || [];
  const globalGlob = "instructions/*.md";
  if (!globalConfig.instructions.includes(globalGlob)) {
    globalConfig.instructions.push(globalGlob);
  }

  fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
  process.stdout.write(`  + merged config into opencode.json\n`);

  process.stdout.write("\nDone. Global installation completed successfully.\n");
}

main();
