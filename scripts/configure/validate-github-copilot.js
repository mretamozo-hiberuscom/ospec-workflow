"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../lib/frontmatter.js");

const REQUIRED_PATHS = [
  { rel: ".github/agents", type: "directory" },
  { rel: ".github/prompts", type: "directory" },
  { rel: ".github/instructions", type: "directory" },
  { rel: ".github/hooks/hooks.json", type: "file" },
  { rel: ".mcp.json", type: "file" },
  { rel: "scripts/hooks", type: "directory" },
  { rel: "scripts/lib", type: "directory" },
  // Skills ship as readable files: every phase agent's "Skills to load before work"
  // section reads skills/<phase>/SKILL.md, so the tree must be present.
  { rel: "skills", type: "directory" },
];

const FORBIDDEN_PATHS = [".claude-plugin", "rules", "hooks/hooks.json"];

const FORBIDDEN_TEXT = [
  { pattern: /vscode\//i, label: "vscode namespace residue" },
  { pattern: /\$\{PLUGIN_ROOT\}/, label: "literal ${PLUGIN_ROOT}" },
  { pattern: /\$\{CLAUDE_PLUGIN_ROOT\}/, label: "literal ${CLAUDE_PLUGIN_ROOT}" },
  { pattern: /\b[A-Za-z]:\\/, label: "absolute Windows path residue" },
  { pattern: /\/Users\//, label: "absolute macOS user path residue" },
];

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

function validateMarkdown(root, errors) {
  for (const file of walkFiles(root, ".github/agents")) {
    if (file.endsWith(".md") && !file.endsWith(".agent.md")) {
      addError(errors, `${file} must use .agent.md suffix`);
    }
  }

  for (const file of listMarkdown(root, ".github/agents", ".agent.md")) {
    const fm = parse(readUtf8(root, file)).frontmatter;
    const target = getField(fm, "target");
    if (!target || target.value !== "github-copilot") {
      addError(errors, `${file} must include target: github-copilot`);
    }
  }

  for (const file of walkFiles(root, ".github/prompts")) {
    if (file.endsWith(".md") && !file.endsWith(".prompt.md")) {
      addError(errors, `${file} must use .prompt.md suffix`);
    }
  }

  for (const file of listMarkdown(root, ".github/prompts", ".prompt.md")) {
    const fm = parse(readUtf8(root, file)).frontmatter;
    if (getField(fm, "target")) {
      addError(errors, `${file} must not include target frontmatter`);
    }
  }

  for (const file of walkFiles(root, ".github/instructions")) {
    if (file.endsWith(".md") && !file.endsWith(".instructions.md")) {
      addError(errors, `${file} must use .instructions.md suffix`);
    }
  }

  for (const file of listMarkdown(root, ".github/instructions", ".instructions.md")) {
    const fm = parse(readUtf8(root, file)).frontmatter;
    const applyTo = getField(fm, "applyTo");
    if (!applyTo || applyTo.value !== "**") {
      addError(errors, `${file} must include applyTo: "**"`);
    }
  }
}

function validateHooks(root, errors) {
  const rel = ".github/hooks/hooks.json";
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

  if (parsed.version !== 1) {
    addError(errors, `${rel} must have version: 1`);
  }
  if (!parsed.hooks || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) {
    addError(errors, `${rel} must have a hooks object`);
    return;
  }

  for (const [eventName, actions] of Object.entries(parsed.hooks)) {
    if (!Array.isArray(actions)) {
      addError(errors, `${rel} event ${eventName} must map to an array`);
      continue;
    }

    for (const [index, action] of actions.entries()) {
      const prefix = `${rel} event ${eventName}[${index}]`;
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        addError(errors, `${prefix} must be an action object`);
        continue;
      }
      if (typeof action.type !== "string" || action.type.length === 0) {
        addError(errors, `${prefix} must include type`);
      }
      if (typeof action.bash !== "string" && typeof action.powershell !== "string") {
        addError(errors, `${prefix} must include bash or powershell`);
      }
      if ("timeoutSec" in action && typeof action.timeoutSec !== "number") {
        addError(errors, `${prefix} timeoutSec must be a number`);
      }
    }
  }
}

// Each phase agent's "Skills to load before work" section names skills/<...>.md
// files it will read. If the generator drops one, the reference dangles, so every
// referenced skill must ship in the output.
function validateSkillReferences(root, errors) {
  const refRe = /`(skills\/[^`]+\.md)`/g;
  for (const file of listMarkdown(root, ".github/agents", ".agent.md")) {
    const text = readUtf8(root, file);
    for (const match of text.matchAll(refRe)) {
      if (!exists(root, match[1])) {
        addError(errors, `${file} references missing skill: ${match[1]}`);
      }
    }
  }
}

// Copilot hook commands invoke repo-relative node scripts (the ${CLAUDE_PLUGIN_ROOT}
// prefix is stripped at generation). Every referenced script must be present, or
// the hook fails at runtime.
function validateHookScripts(root, errors) {
  const rel = ".github/hooks/hooks.json";
  if (pathType(root, rel) !== "file") {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel));
  } catch {
    return; // JSON shape already reported by validateHooks
  }

  const scriptRe = /(scripts\/[^\s"']+\.js)/g;
  for (const actions of Object.values(parsed.hooks || {})) {
    if (!Array.isArray(actions)) {
      continue;
    }
    for (const action of actions) {
      for (const command of [action && action.bash, action && action.powershell]) {
        if (typeof command !== "string") {
          continue;
        }
        for (const match of command.matchAll(scriptRe)) {
          if (!exists(root, match[1])) {
            addError(errors, `${rel} references missing script: ${match[1]}`);
          }
        }
      }
    }
  }
}

// Scan .mcp.json for unresolved ${input:NAME} placeholders. These residuals
// indicate the profile forgot to opt in to mcpPlaceholders normalization.
// Mirrors the FORBIDDEN_TEXT walk but scoped to a single file.
function validateMcpResidualPlaceholders(root, errors) {
  const rel = ".mcp.json";
  if (pathType(root, rel) !== "file") {
    return;
  }
  let text;
  try {
    text = readUtf8(root, rel);
  } catch {
    return; // read failure already covered by validateRequiredPaths
  }
  if (/\$\{input:/.test(text)) {
    addError(errors, `residual \${input: placeholder found in ${rel} — profile must opt in to mcpPlaceholders normalization`);
  }
}

// .mcp.json passes through unchanged; confirm it is a usable Copilot MCP config:
// an mcpServers object whose entries each define a command (stdio) or url (http/sse).
function validateMcp(root, errors) {
  const rel = ".mcp.json";
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

  const servers = parsed.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    addError(errors, `${rel} must have an mcpServers object`);
    return;
  }

  for (const [name, server] of Object.entries(servers)) {
    if (!server || typeof server !== "object" || Array.isArray(server)) {
      addError(errors, `${rel} server ${name} must be an object`);
      continue;
    }
    const hasCommand = typeof server.command === "string" && server.command.length > 0;
    const hasUrl = typeof server.url === "string" && server.url.length > 0;
    if (!hasCommand && !hasUrl) {
      addError(errors, `${rel} server ${name} must define a command (stdio) or url (http/sse)`);
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
  validateMarkdown(absRoot, errors);
  validateHooks(absRoot, errors);
  validateSkillReferences(absRoot, errors);
  validateHookScripts(absRoot, errors);
  validateMcp(absRoot, errors);
  validateMcpResidualPlaceholders(absRoot, errors);

  return { errors, warnings };
}

function main(argv) {
  const root = argv[0];
  if (!root) {
    process.stderr.write("usage: node scripts/configure/validate-github-copilot.js <output-root>\n");
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
