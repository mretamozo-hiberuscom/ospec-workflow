"use strict";

// Idempotent installer to register the ospec-workflow globally under ~/.copilot/
// directory. Builds the github-copilot target, copies agents, prompts, instructions,
// hooks, and skills to the global directories, and merges the MCP config.
//
// Usage:
//   node scripts/configure/install-global-copilot.js

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runConfigure } = require("./cli.js");
const { copyBinaryToTree } = require("./install-target.js");

function main() {
  const sourceDir = path.resolve(__dirname, "..", "..");
  const home = os.homedir();
  const globalDir = path.join(home, ".copilot");

  if (!fs.existsSync(globalDir)) {
    process.stdout.write(`Creating global Copilot CLI configuration directory at ${globalDir}...\n`);
    fs.mkdirSync(globalDir, { recursive: true });
  }

  // 1. Build the target github-copilot to dist/github-copilot
  const outDir = path.join(sourceDir, "dist", "github-copilot");
  const result = runConfigure({ sourceDir, target: "github-copilot", outDir, validate: true });
  if (result.exitCode !== 0) {
    process.stderr.write("\nBuild/validation failed; aborting global install\n");
    process.exitCode = result.exitCode;
    return;
  }

  // Copy compiler hooks binary if present in release/dist/
  copyBinaryToTree(outDir, "github-copilot", sourceDir);

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
  copyFolder(path.join(outDir, ".github", "agents"), path.join(globalDir, "agents"));
  copyFolder(path.join(outDir, ".github", "prompts"), path.join(globalDir, "prompts"));
  copyFolder(path.join(outDir, ".github", "instructions"), path.join(globalDir, "instructions"));
  copyFolder(path.join(outDir, ".github", "hooks"), path.join(globalDir, "hooks"));
  copyFolder(path.join(outDir, "skills"), path.join(globalDir, "skills"));
  copyFolder(path.join(outDir, "scripts"), path.join(globalDir, "scripts"));

  if (fs.existsSync(path.join(outDir, "release"))) {
    copyFolder(path.join(outDir, "release"), path.join(globalDir, "release"));
  }

  // 3. Merge MCP configuration
  const globalConfigPath = path.join(globalDir, "mcp-config.json");
  const generatedConfigPath = path.join(outDir, ".mcp.json");

  let globalConfig = {};
  if (fs.existsSync(globalConfigPath)) {
    try {
      globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, "utf8"));
    } catch (err) {
      process.stderr.write(`Warning: Failed to parse existing global mcp-config.json: ${err.message}\n`);
    }
  }

  let generatedConfig;
  try {
    generatedConfig = JSON.parse(fs.readFileSync(generatedConfigPath, "utf8"));
  } catch (err) {
    throw new Error(
      `Could not read generated .mcp.json at ${generatedConfigPath}: ${err.message}`,
    );
  }

  // Merge MCP servers
  globalConfig.mcpServers = globalConfig.mcpServers || {};
  for (const [key, value] of Object.entries(generatedConfig.mcpServers || {})) {
    globalConfig.mcpServers[key] = value;
  }

  fs.writeFileSync(globalConfigPath, JSON.stringify(globalConfig, null, 2));
  process.stdout.write(`  + merged config into mcp-config.json\n`);

  process.stdout.write("\nDone. Global installation completed successfully.\n");
}

try {
  main();
} catch (err) {
  process.stderr.write(`\nGlobal install failed: ${err.message}\n`);
  process.exit(1);
}
