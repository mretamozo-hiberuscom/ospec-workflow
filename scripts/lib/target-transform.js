"use strict";

// Pure transform: reshapes the canonical VS Code-format plugin source into a
// target-native file collection. NO filesystem, network, or process side
// effects; the input `files` is never mutated. All IO lives in
// scripts/configure/cli.js. Composes the per-concern transforms below, driven
// entirely by the declarative target profile. See design.md / specs/target-generator.

const { parse, serialize, getField, stripKeys, setScalar, setArray } = require("./frontmatter.js");
const { resolveModel, OMIT } = require("./model-resolver.js");

// A file collection is an array of { path, content:string }.

function transform({ files, profile, models }) {
  const rulesContent = collectRules(files, profile);
  const out = [];

  for (const file of files) {
    const handled = handleFile(file, profile, models, rulesContent);
    if (handled === null) {
      continue; // dropped (e.g. rules inlined elsewhere)
    }
    out.push(handled);
  }

  return { files: out };
}

function handleFile(file, profile, models, rulesContent) {
  const { path } = file;

  if (profile.manifest && path === profile.manifest.location) {
    return reshapeManifest(file, profile);
  }

  if (profile.hooks && profile.hooks.shape === "nested" && path === (profile.hooks.location || "hooks/hooks.json")) {
    return nestHooks(file);
  }

  if (isRulesFile(path)) {
    if (profile.rules && isInlineStrategy(profile.rules.strategy)) {
      return null; // content folded into the orchestrator agent/skill
    }
    return { path, content: file.content };
  }

  if (isAgent(path, profile)) {
    if (profile.orchestrator && profile.orchestrator.emitAs === "skill" && agentBaseName(path, profile) === profile.orchestrator.agent) {
      return emitOrchestratorSkill(file, profile, rulesContent);
    }
    return handleAgent(file, profile, models);
  }

  if (isCommand(path, profile)) {
    return handleCommand(file, profile);
  }

  // Passthrough (skills, shared docs). Tool names are still substituted so no
  // foreign namespace survives anywhere in the generated tree.
  if (profile.toolMap && path.endsWith(".md")) {
    return { path, content: substituteProse(file.content, profile.toolMap) };
  }
  return { path, content: file.content };
}

// --- dispatch helpers ------------------------------------------------------

function isInlineStrategy(strategy) {
  return strategy === "inline-into-orchestrator";
}

function isRulesFile(path) {
  return path.startsWith("rules/");
}

function isAgent(path, profile) {
  return path.startsWith("agents/") && path.endsWith(profile.agentFile.from);
}

function isCommand(path, profile) {
  return path.startsWith("commands/") && path.endsWith(profile.commandFile.from);
}

function agentBaseName(path, profile) {
  return path.slice("agents/".length, path.length - profile.agentFile.from.length);
}

function renameExtension(path, { from, to }) {
  return from === to ? path : path.slice(0, path.length - from.length) + to;
}

// --- manifest --------------------------------------------------------------

function reshapeManifest(file, profile) {
  const obj = JSON.parse(file.content);
  const { omitFields = [], dropFields = [] } = profile.manifest;

  for (const key of omitFields) {
    if (typeof obj[key] === "string") {
      delete obj[key];
    }
  }
  for (const key of dropFields) {
    delete obj[key];
  }

  return { path: file.path, content: JSON.stringify(obj, null, 2) };
}

// --- hooks -----------------------------------------------------------------

function nestHooks(file) {
  const obj = JSON.parse(file.content);
  const events = obj.hooks || {};
  const nested = {};

  for (const [event, entries] of Object.entries(events)) {
    nested[event] = [{ hooks: entries }];
  }

  return { path: file.path, content: JSON.stringify({ ...obj, hooks: nested }, null, 2) };
}

// --- rules inlining --------------------------------------------------------

function collectRules(files, profile) {
  if (!profile.rules || !isInlineStrategy(profile.rules.strategy)) {
    return "";
  }

  const parts = [];
  for (const file of files) {
    if (isRulesFile(file.path)) {
      let body = parse(file.content).body.trim();
      if (profile.toolMap) {
        body = substituteProse(body, profile.toolMap);
      }
      parts.push(body);
    }
  }

  return parts.join("\n\n");
}

// --- orchestrator-as-skill (claude) ----------------------------------------

function emitOrchestratorSkill(file, profile, rulesContent) {
  const parsed = parse(file.content);
  let body = parsed.body;

  if (profile.toolMap) {
    body = substituteProse(body, profile.toolMap);
  }
  if (rulesContent) {
    body = body.replace(/\s*$/, "") + "\n\n" + rulesContent + "\n";
  }

  const nameField = getField(parsed.frontmatter, "name");
  const name = (nameField && nameField.value) || profile.orchestrator.agent;
  const descField = getField(parsed.frontmatter, "description");
  const description = profile.orchestrator.description || (descField && descField.value) || "";

  const frontmatter = [
    { key: "name", value: name, rawLines: [`name: ${name}`] },
    { key: "description", value: description, rawLines: [`description: ${JSON.stringify(description)}`] },
  ];

  return { path: profile.orchestrator.skillPath, content: serialize({ frontmatter, body }) };
}

// --- agents ----------------------------------------------------------------

function handleAgent(file, profile, models) {
  const newPath = renameExtension(file.path, profile.agentFile);
  let { frontmatter, body } = parse(file.content);
  const nameField = getField(frontmatter, "name");
  const agentName = nameField ? nameField.value : undefined;

  if (profile.frontmatter && profile.frontmatter.stripKeys) {
    frontmatter = stripKeys(frontmatter, profile.frontmatter.stripKeys);
  }

  if (profile.toolMap) {
    frontmatter = mapToolsFrontmatter(frontmatter, profile.toolMap);
    body = substituteProse(body, profile.toolMap);
  }

  if (profile.model && agentName) {
    const resolved = resolveModel(agentName, profile.id, models);
    if (resolved !== OMIT) {
      frontmatter = Array.isArray(resolved)
        ? setArray(frontmatter, "model", resolved)
        : setScalar(frontmatter, "model", resolved);
    }
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- commands --------------------------------------------------------------

function handleCommand(file, profile) {
  const newPath = renameExtension(file.path, profile.commandFile);
  let { frontmatter, body } = parse(file.content);

  if (profile.frontmatter) {
    const strip = [
      ...(profile.frontmatter.stripKeys || []),
      ...(profile.frontmatter.commandStripKeys || []),
    ];
    if (strip.length > 0) {
      frontmatter = stripKeys(frontmatter, strip);
    }
  }

  if (profile.toolMap) {
    frontmatter = mapToolsFrontmatter(frontmatter, profile.toolMap);
    body = substituteProse(body, profile.toolMap);
  }

  if (profile.commandVars) {
    const named = [];
    body = body.replace(/\$\{input:([A-Za-z0-9_-]+)\}/g, (_match, name) => {
      named.push(name);
      return "$" + name;
    });
    body = body.replace(/\$\{input\}/g, "$ARGUMENTS");
    if (named.length > 0) {
      // `arguments` (space-separated names) is what actually enables `$name`
      // substitution in Claude; `argument-hint` is only the autocomplete hint.
      frontmatter = setScalar(frontmatter, "arguments", named.join(" "));
      // Plain names (no [..] — that parses as a YAML array). argument-hint is only the
      // autocomplete hint; `arguments` is what enables substitution.
      frontmatter = setScalar(frontmatter, "argument-hint", named.join(" "));
    }
  }

  if (profile.frontmatter && profile.frontmatter.commandRouting) {
    const addKeys = profile.frontmatter.commandRouting.addKeys || {};
    for (const [key, value] of Object.entries(addKeys)) {
      frontmatter = setScalar(frontmatter, key, value);
    }
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- tool-name substitution ------------------------------------------------

function mapToolsFrontmatter(frontmatter, toolMap) {
  const field = getField(frontmatter, "tools");
  if (!field || !Array.isArray(field.value)) {
    return frontmatter;
  }

  const mapped = [];
  for (const tool of field.value) {
    const replacement = toolMap[tool];
    if (replacement === undefined) {
      mapped.push(tool);
    } else if (Array.isArray(replacement)) {
      mapped.push(...replacement);
    } else {
      mapped.push(replacement);
    }
  }

  return setArray(frontmatter, "tools", mapped);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// Match a tool name as a distinct token: not flanked by word chars or a slash.
function tokenRegExp(key) {
  return new RegExp(`(?<![\\w/])${escapeRegExp(key)}(?![\\w/])`, "g");
}

// Substitute tool names in prose. Namespaced names (containing `/`) are
// unambiguous tool references and are replaced everywhere — this is what keeps a
// generated tree free of `vscode/` strings. Generic names (read, edit, agent)
// collide with ordinary English, so they are replaced ONLY inside backtick code
// spans, where they are explicit tool references — never in bare prose.
function substituteProse(body, toolMap) {
  let out = body;
  const keys = Object.keys(toolMap).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const replacement = toolMap[key];
    const primary = Array.isArray(replacement) ? replacement[0] : replacement;
    if (key.includes("/")) {
      out = out.replace(tokenRegExp(key), primary);
    } else {
      out = out.replace(new RegExp("`" + escapeRegExp(key) + "`", "g"), "`" + primary + "`");
    }
  }

  return out;
}

module.exports = { transform };
