"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../lib/frontmatter.js");

const REQUIRED_PATHS = [
  { rel: ".opencode/agents", type: "directory" },
  { rel: ".opencode/commands", type: "directory" },
  { rel: ".opencode/instructions", type: "directory" },
  { rel: ".opencode/plugins/ospec.js", type: "file" },
  { rel: "opencode.json", type: "file" },
  { rel: "scripts/hooks", type: "directory" },
  { rel: "scripts/lib", type: "directory" },
  // Skills ship as readable files: every phase agent's "Skills to load before work"
  // section reads skills/<phase>/SKILL.md, so the tree must be present.
  { rel: "skills", type: "directory" },
];

// opencode reads .opencode/ + opencode.json; the Claude/Copilot layouts and the
// standalone .mcp.json (folded into opencode.json) must not leak through.
const FORBIDDEN_PATHS = [".claude-plugin", ".github", "rules", "hooks/hooks.json", ".mcp.json"];

const FORBIDDEN_TEXT = [
  { pattern: /vscode\//i, label: "vscode namespace residue" },
  { pattern: /\$\{PLUGIN_ROOT\}/, label: "literal ${PLUGIN_ROOT}" },
  { pattern: /\$\{CLAUDE_PLUGIN_ROOT\}/, label: "literal ${CLAUDE_PLUGIN_ROOT}" },
];

const VALID_MODES = new Set(["primary", "subagent", "all"]);
// Command fields opencode recognizes; anything else is VS Code/plugin residue.
const FORBIDDEN_COMMAND_KEYS = ["name", "target", "tools", "argument-hint", "user-invocable"];

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function pathType(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    return "missing";
  }
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    return "directory";
  }
  if (stat.isFile()) {
    return "file";
  }
  return "other";
}

function walkFiles(root, relDir = "", acc = []) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return acc;
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkFiles(root, rel, acc);
    } else if (entry.isFile()) {
      acc.push(rel);
    }
  }
  return acc;
}

function walkPaths(root, relDir = "", acc = []) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return acc;
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    acc.push(rel);
    if (entry.isDirectory()) {
      walkPaths(root, rel, acc);
    }
  }
  return acc;
}

function readUtf8(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function addError(errors, message) {
  errors.push(message);
}

function validateRequiredPaths(root, errors) {
  for (const { rel, type } of REQUIRED_PATHS) {
    const actual = pathType(root, rel);
    if (actual === "missing") {
      addError(errors, `missing required path: ${rel}`);
    } else if (actual !== type) {
      addError(errors, `required ${type} is not a ${type}: ${rel}`);
    }
  }
}

function validateForbiddenPaths(root, errors) {
  for (const rel of FORBIDDEN_PATHS) {
    if (exists(root, rel)) {
      addError(errors, `forbidden path present: ${rel}`);
    }
  }
  for (const rel of walkPaths(root)) {
    if (rel.toLowerCase().includes("vscode")) {
      addError(errors, `vscode path residue: ${rel}`);
    }
  }
}

function validateForbiddenText(root, errors) {
  for (const file of walkFiles(root)) {
    let text;
    try {
      text = readUtf8(root, file);
    } catch {
      continue;
    }
    for (const rule of FORBIDDEN_TEXT) {
      if (rule.pattern.test(text)) {
        addError(errors, `${rule.label} in ${file}`);
      }
    }
  }
}

function listMarkdown(root, relDir, suffix) {
  return walkFiles(root, relDir).filter((file) => file.endsWith(suffix));
}

// Agents: flat .md (no .agent.md residue), each a subagent/primary/all with no
// VS Code-only keys.
function validateAgents(root, errors) {
  for (const file of walkFiles(root, ".opencode/agents")) {
    if (!file.endsWith(".md")) {
      continue;
    }
    if (file.endsWith(".agent.md")) {
      addError(errors, `${file} must use a flat .md suffix (no .agent.md)`);
    }
    const fm = parse(readUtf8(root, file)).frontmatter;

    const mode = getField(fm, "mode");
    if (!mode || !VALID_MODES.has(mode.value)) {
      addError(errors, `${file} must declare mode: primary|subagent|all`);
    }
    for (const key of ["target", "user-invocable", "agents"]) {
      if (getField(fm, key)) {
        addError(errors, `${file} must not include ${key} frontmatter`);
      }
    }
  }
}

// Commands: flat .md, keep description/agent only — no VS Code/plugin residue.
function validateCommands(root, errors) {
  for (const file of walkFiles(root, ".opencode/commands")) {
    if (!file.endsWith(".md")) {
      continue;
    }
    if (file.endsWith(".prompt.md")) {
      addError(errors, `${file} must use a flat .md suffix (no .prompt.md)`);
    }
    const fm = parse(readUtf8(root, file)).frontmatter;
    for (const key of FORBIDDEN_COMMAND_KEYS) {
      if (getField(fm, key)) {
        addError(errors, `${file} must not include ${key} frontmatter`);
      }
    }
  }
}

// The synthesized opencode.json: valid JSON, $schema set, well-formed mcp and
// instructions if present.
function validateConfig(root, errors) {
  const rel = "opencode.json";
  if (pathType(root, rel) !== "file") {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel));
  } catch (error) {
    addError(errors, `${rel} is not valid JSON: ${error.message}`);
    return;
  }

  if (typeof parsed.$schema !== "string" || !parsed.$schema) {
    addError(errors, `${rel} must include a $schema`);
  }

  if (parsed.mcp !== undefined) {
    if (!parsed.mcp || typeof parsed.mcp !== "object" || Array.isArray(parsed.mcp)) {
      addError(errors, `${rel} mcp must be an object`);
    } else {
      for (const [name, server] of Object.entries(parsed.mcp)) {
        if (!server || typeof server !== "object" || Array.isArray(server)) {
          addError(errors, `${rel} mcp server ${name} must be an object`);
          continue;
        }
        if (server.type === "local") {
          if (!Array.isArray(server.command) || server.command.length === 0) {
            addError(errors, `${rel} mcp server ${name} (local) must have a non-empty command array`);
          }
        } else if (server.type === "remote") {
          if (typeof server.url !== "string" || !server.url) {
            addError(errors, `${rel} mcp server ${name} (remote) must have a url`);
          }
        } else {
          addError(errors, `${rel} mcp server ${name} must have type local or remote`);
        }
      }
    }
  }

  if (parsed.instructions !== undefined) {
    if (!Array.isArray(parsed.instructions) || parsed.instructions.some((entry) => typeof entry !== "string")) {
      addError(errors, `${rel} instructions must be an array of strings`);
    }
  }
}

// The plugin shim bridges opencode events to the ospec-hooks Go binary via
// spawnSync. Validate that the plugin uses spawnSync, references the binary,
// and wires both required subcommands.
function validatePlugin(root, errors) {
  const rel = ".opencode/plugins/ospec.js";
  if (pathType(root, rel) !== "file") {
    return;
  }
  const text = readUtf8(root, rel);
  // Must use spawnSync to invoke the binary (not require() of hook JS files).
  if (!text.includes("spawnSync")) {
    addError(errors, `${rel} must use spawnSync to invoke the ospec-hooks binary`);
  }
  // Must reference the binary by name.
  if (!text.includes("ospec-hooks")) {
    addError(errors, `${rel} must reference the ospec-hooks binary`);
  }
  // Must wire both hooks as subcommands.
  if (!text.includes("pre-tool-use")) {
    addError(errors, `${rel} must bridge the pre-tool-use subcommand`);
  }
  if (!text.includes("session-start")) {
    addError(errors, `${rel} must bridge the session-start subcommand`);
  }
}

// Each phase agent's "Skills to load before work" section names skills/<...>.md
// files it reads; a dropped skill leaves a dangling reference.
function validateSkillReferences(root, errors) {
  const refRe = /`(skills\/[^`]+\.md)`/g;
  for (const file of listMarkdown(root, ".opencode/agents", ".md")) {
    const text = readUtf8(root, file);
    for (const match of text.matchAll(refRe)) {
      if (!exists(root, match[1])) {
        addError(errors, `${file} references missing skill: ${match[1]}`);
      }
    }
  }
}

function validate(root) {
  const errors = [];
  const warnings = [];
  const absRoot = path.resolve(root);

  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    addError(errors, `output root is not a directory: ${root}`);
    return { errors, warnings };
  }

  validateRequiredPaths(absRoot, errors);
  validateForbiddenPaths(absRoot, errors);
  validateForbiddenText(absRoot, errors);
  validateAgents(absRoot, errors);
  validateCommands(absRoot, errors);
  validateConfig(absRoot, errors);
  validatePlugin(absRoot, errors);
  validateSkillReferences(absRoot, errors);

  return { errors, warnings };
}

function main(argv) {
  const root = argv[0];
  if (!root) {
    process.stderr.write("usage: node scripts/configure/validate-opencode.js <output-root>\n");
    process.exitCode = 2;
    return;
  }

  const result = validate(root);
  for (const error of result.errors) {
    process.stderr.write(`error: ${error}\n`);
  }
  for (const warning of result.warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
  process.stdout.write(`${result.errors.length} errors, ${result.warnings.length} warnings\n`);
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { validate, main };
