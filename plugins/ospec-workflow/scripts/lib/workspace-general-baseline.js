"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { parseAtlas } = require("./workspace-atlas.js");

// Records one dependency version under dependenciesMap[name][memberId].
function recordDep(dependenciesMap, memberId, name, version) {
  if (!dependenciesMap[name]) {
    dependenciesMap[name] = {};
  }
  dependenciesMap[name][memberId] = version;
}

// Records every { name: version } entry from a package.json deps object.
function recordDeps(dependenciesMap, memberId, deps) {
  if (!deps) return;
  for (const [name, version] of Object.entries(deps)) {
    recordDep(dependenciesMap, memberId, name, version);
  }
}

async function analyzeGeneralBaseline(workspaceYamlPath, coordinatorRoot) {
  // 1. Read workspace.yaml
  const workspaceContent = await fs.readFile(workspaceYamlPath, "utf8");
  const atlas = parseAtlas(workspaceContent);

  const dependenciesMap = {};

  // 2. Scan each member
  for (const member of atlas.members || []) {
    const memberPath = path.resolve(coordinatorRoot, member.path);
    
    // Check package.json
    try {
      const pkgJsonPath = path.join(memberPath, "package.json");
      const pkgContent = await fs.readFile(pkgJsonPath, "utf8");
      const pkg = JSON.parse(pkgContent);

      recordDeps(dependenciesMap, member.id, pkg.dependencies);
      recordDeps(dependenciesMap, member.id, pkg.devDependencies);
    } catch (err) {
      // Ignore if package.json is missing or invalid
    }

    // Check go.mod
    try {
      const goModPath = path.join(memberPath, "go.mod");
      const goModContent = await fs.readFile(goModPath, "utf8");
      const lines = goModContent.split(/\r?\n/);
      let inRequire = false;

      for (let line of lines) {
        line = line.trim();
        if (line.startsWith("require (")) {
          inRequire = true;
          continue;
        }
        if (inRequire && line.startsWith(")")) {
          inRequire = false;
          continue;
        }
        if (line.startsWith("require ")) {
          const parts = line.substring(8).trim().split(/\s+/);
          if (parts.length >= 2) {
            recordDep(dependenciesMap, member.id, parts[0], parts[1]);
          }
        } else if (inRequire && line) {
          const parts = line.split(/\s+/);
          if (parts.length >= 2) {
            recordDep(dependenciesMap, member.id, parts[0], parts[1]);
          }
        }
      }
    } catch (err) {
      // Ignore if go.mod is missing
    }
  }

  // 3. Process and group dependencies
  const aligned = [];
  const misaligned = [];

  for (const [name, versions] of Object.entries(dependenciesMap)) {
    const memberIds = Object.keys(versions);
    const versionSet = new Set(Object.values(versions));

    if (versionSet.size === 1) {
      aligned.push({
        name,
        version: [...versionSet][0],
        membersCount: memberIds.length,
      });
    } else {
      misaligned.push({
        name,
        versions,
      });
    }
  }

  // Sort alphabetically
  aligned.sort((a, b) => a.name.localeCompare(b.name));
  misaligned.sort((a, b) => a.name.localeCompare(b.name));

  // 4. Generate shared-baseline.md
  const lines = [
    "# Shared Baseline Report",
    "",
    "Este informe documenta la base común de dependencias y las discrepancias de versiones entre los miembros del workspace.",
    "",
    "## Aligned Dependencies",
    "",
    "Las siguientes dependencias están alineadas en la misma versión en todos los miembros que las utilizan:",
    "",
    "| Package | Version | Members Count |",
    "| --- | --- | --- |",
  ];

  if (aligned.length === 0) {
    lines.push("| None | - | 0 |");
  } else {
    for (const dep of aligned) {
      lines.push(`| ${dep.name} | ${dep.version} | ${dep.membersCount} |`);
    }
  }

  lines.push(
    "",
    "## Misaligned Dependencies (Deviations)",
    "",
    "Las siguientes dependencias presentan discrepancias de versión entre miembros:",
    "",
    "| Package | Member | Version |",
    "| --- | --- | --- |"
  );

  if (misaligned.length === 0) {
    lines.push("| None | - | - |");
  } else {
    for (const dep of misaligned) {
      for (const [memberId, version] of Object.entries(dep.versions)) {
        lines.push(`| ${dep.name} | ${memberId} | ${version} |`);
      }
    }
  }

  lines.push("");

  const outputDir = path.join(coordinatorRoot, "docs", "architecture");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "shared-baseline.md"), lines.join("\n"), "utf8");
}

module.exports = { analyzeGeneralBaseline };
