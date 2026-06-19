"use strict";

// Pure transform: reshapes the canonical VS Code-format plugin source into a
// target-native file collection. NO filesystem, network, or process side
// effects; the input `files` is never mutated. All IO lives in
// scripts/configure/cli.js. Composes the per-concern transforms below, driven
// entirely by the declarative target profile. See design.md / specs/target-generator.

const { parse, serialize, getField, stripKeys, setScalar, setArray, setBlockMap } = require("./frontmatter.js");
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

  // Files synthesized from collected source data (not 1:1 with any input): the
  // opencode.json config (schema + mcp + instructions) and the plugin shim.
  for (const synthesized of synthesizeFiles(files, profile)) {
    out.push(synthesized);
  }

  // Sort by path so the output is deterministic regardless of the input's
  // filesystem-dependent read order (stable across OSes and CI runners).
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return { files: out };
}

function handleFile(file, profile, models, rulesContent) {
  const { path } = file;

  if (isDropped(path, profile)) {
    return null; // artifact the target does not consume (e.g. plugin manifest/hooks)
  }

  if (profile.manifest && path === profile.manifest.location) {
    return reshapeManifest(file, profile);
  }

  if (profile.hooks && profile.hooks.shape === "nested" && path === (profile.hooks.location || "hooks/hooks.json")) {
    return nestHooks(file);
  }

  if (profile.hooks && profile.hooks.format === "copilot" && path === (profile.hooks.source || "hooks/hooks.json")) {
    return copilotHooks(file, profile);
  }

  if (isRulesFile(path)) {
    if (profile.rules && isInlineStrategy(profile.rules.strategy)) {
      return null; // content folded into the orchestrator agent/skill
    }
    if (profile.rules && profile.rules.strategy === "to-instructions") {
      return toInstructionFile(file, profile);
    }
    if (profile.rules && profile.rules.strategy === "to-instructions-config") {
      return toInstructionConfigFile(file, profile);
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

  // .mcp.json for profiles with MCP placeholder normalization enabled.
  // Must sit before passthrough so profiles without mcpPlaceholders fall through.
  if (profile.mcpPlaceholders && path === ".mcp.json") {
    return normalizeMcpPlaceholders(file);
  }

  // Passthrough (skills, shared docs). Tool names are still substituted so no
  // foreign namespace survives anywhere in the generated tree.
  if (path.endsWith(".md")) {
    let content = file.content;
    if (profile.toolMap) {
      content = substituteProse(content, profile.toolMap);
    }
    content = substituteAgentNames(content, profile);
    return { path, content };
  }
  return { path, content: file.content };
}

// --- dispatch helpers ------------------------------------------------------

function isInlineStrategy(strategy) {
  return strategy === "inline-into-orchestrator";
}

function isDropped(path, profile) {
  return Array.isArray(profile.drop) && profile.drop.some((prefix) => path === prefix || path.startsWith(prefix));
}

function isRulesFile(path) {
  return path.startsWith("rules/");
}

// Remap a category path onto a target directory, e.g.
// remapDir("agents/sdd-apply.agent.md", "agents/", ".github/agents") ->
// ".github/agents/sdd-apply.agent.md".
function remapDir(path, sourcePrefix, targetDir) {
  return `${targetDir}/${path.slice(sourcePrefix.length)}`;
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

// Parse a tracked { path, content } file as JSON, attaching the source path to
// any syntax error so a malformed config names the offending file instead of
// aborting the whole transform with an opaque SyntaxError.
function parseJsonFile(file) {
  try {
    return JSON.parse(file.content);
  } catch (err) {
    throw new Error(`${file.path}: invalid JSON: ${err.message}`);
  }
}

// --- manifest --------------------------------------------------------------

function reshapeManifest(file, profile) {
  const obj = parseJsonFile(file);
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
  const obj = parseJsonFile(file);
  const events = obj.hooks || {};
  const nested = {};

  for (const [event, entries] of Object.entries(events)) {
    nested[event] = [{ hooks: entries }];
  }

  return { path: file.path, content: JSON.stringify({ ...obj, hooks: nested }, null, 2) };
}

// Reshape the source hooks into GitHub Copilot CLI's project-hook schema at
// .github/hooks/hooks.json: { version, hooks: { <camelCaseEvent>: [ { type,
// bash, powershell, timeoutSec } ] } }. Events without a Copilot equivalent are
// dropped; the plugin-root path variable is stripped to a repo-relative command.
function copilotHooks(file, profile) {
  const obj = parseJsonFile(file);
  const events = obj.hooks || {};
  const eventMap = profile.hooks.eventMap || {};
  const stripVar = profile.hooks.stripPathVar;
  const out = {};

  for (const [event, entries] of Object.entries(events)) {
    const mapped = eventMap[event];
    if (!mapped) {
      continue; // no Copilot equivalent (e.g. PreCompact)
    }
    out[mapped] = entries.map((entry) => {
      const command = stripVar ? entry.command.split(stripVar).join("") : entry.command;
      const hook = { type: "command", bash: command, powershell: command };
      if (entry.timeout !== undefined) {
        hook.timeoutSec = entry.timeout;
      }
      return hook;
    });
  }

  return { path: profile.hooks.location, content: JSON.stringify({ version: 1, hooks: out }, null, 2) };
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
      body = substituteAgentNames(body, profile);
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
  body = substituteAgentNames(body, profile);

  const nameField = getField(parsed.frontmatter, "name");
  const name = (nameField && nameField.value) || profile.orchestrator.agent;
  const descField = getField(parsed.frontmatter, "description");
  let description = profile.orchestrator.description || (descField && descField.value) || "";
  description = substituteAgentNames(description, profile);

  const frontmatter = [
    { key: "name", value: name, rawLines: [`name: ${name}`] },
    { key: "description", value: description, rawLines: [`description: ${JSON.stringify(description)}`] },
  ];

  return { path: profile.orchestrator.skillPath, content: serialize({ frontmatter, body }) };
}

// --- agents ----------------------------------------------------------------

function handleAgent(file, profile, models) {
  let { frontmatter, body } = parse(file.content);
  const nameField = getField(frontmatter, "name");
  const originalAgentName = nameField ? nameField.value : undefined;
  let agentName = originalAgentName;

  if (profile.orchestrator && profile.orchestrator.renameTo && originalAgentName === profile.orchestrator.agent) {
    agentName = profile.orchestrator.renameTo;
    frontmatter = setScalar(frontmatter, "name", agentName);
  }

  let newPath = renameExtension(file.path, profile.agentFile);
  if (profile.orchestrator && profile.orchestrator.renameTo && agentBaseName(file.path, profile) === profile.orchestrator.agent) {
    const ext = profile.agentFile.to;
    newPath = `agents/${profile.orchestrator.renameTo}${ext}`;
  }
  if (profile.agentDir) {
    newPath = remapDir(newPath, "agents/", profile.agentDir);
  }

  // Capture mode from user-invocable before it is stripped: the user-invocable
  // entry agent becomes a `primary` agent, every worker a `subagent`.
  let mode;
  if (profile.agentMode) {
    const invocable = getField(frontmatter, "user-invocable");
    mode = invocable && invocable.value === "false" ? profile.agentMode.subagent : profile.agentMode.primary;
  }

  if (profile.frontmatter && profile.frontmatter.stripKeys) {
    frontmatter = stripKeys(frontmatter, profile.frontmatter.stripKeys);
  }

  if (mode) {
    frontmatter = setScalar(frontmatter, "mode", mode);
  }

  if (profile.setAgentFrontmatter) {
    for (const [key, value] of Object.entries(profile.setAgentFrontmatter)) {
      frontmatter = setScalar(frontmatter, key, value);
    }
  }

  if (profile.toolMap) {
    frontmatter = profile.toolsAsMap
      ? mapToolsFrontmatterAsMap(frontmatter, profile.toolMap, profile.dropTools)
      : mapToolsFrontmatter(frontmatter, profile.toolMap, profile.dropTools);
    body = substituteProse(body, profile.toolMap);
  }

  body = substituteAgentNames(body, profile);

  if (profile.model && originalAgentName) {
    const resolved = resolveModel(originalAgentName, profile.id, models);
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
  let newPath = renameExtension(file.path, profile.commandFile);
  if (profile.commandDir) {
    newPath = remapDir(newPath, "commands/", profile.commandDir);
  }
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
    frontmatter = mapToolsFrontmatter(frontmatter, profile.toolMap, profile.dropTools);
    body = substituteProse(body, profile.toolMap);
  }

  if (profile.commandVars && profile.commandVars.style === "positional") {
    // opencode has no named arguments: map each distinct ${input:name} to a
    // positional $1/$2 (by first appearance) and bare ${input} to $ARGUMENTS.
    const order = [];
    body = body.replace(/\$\{input:([A-Za-z0-9_-]+)\}/g, (_match, name) => {
      let index = order.indexOf(name);
      if (index === -1) {
        order.push(name);
        index = order.length - 1;
      }
      return "$" + (index + 1);
    });
    body = body.replace(/\$\{input\}/g, "$ARGUMENTS");
  } else if (profile.commandVars) {
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

  // Update command routing if orchestrator is renamed:
  if (profile.orchestrator && profile.orchestrator.renameTo) {
    const agentField = getField(frontmatter, "agent");
    if (agentField && agentField.value === profile.orchestrator.agent) {
      frontmatter = setScalar(frontmatter, "agent", profile.orchestrator.renameTo);
    }
  }

  body = substituteAgentNames(body, profile);
  const descField = getField(frontmatter, "description");
  if (descField && descField.value) {
    frontmatter = setScalar(frontmatter, "description", substituteAgentNames(descField.value, profile));
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- tool-name substitution ------------------------------------------------

function mapToolsFrontmatter(frontmatter, toolMap, dropTools) {
  const field = getField(frontmatter, "tools");
  if (!field || !Array.isArray(field.value)) {
    return frontmatter;
  }

  const drop = new Set(dropTools || []);
  const mapped = [];
  for (const tool of field.value) {
    if (drop.has(tool)) {
      continue; // tool has no equivalent on this target; remove from the grant
    }
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

// Like mapToolsFrontmatter, but emits the opencode `tools:` MAP shape (tool ->
// true) instead of an array. Abstract tools expand to their built-in name(s);
// duplicates (e.g. read -> read appearing twice) collapse to one entry.
function mapToolsFrontmatterAsMap(frontmatter, toolMap, dropTools) {
  const field = getField(frontmatter, "tools");
  if (!field || !Array.isArray(field.value)) {
    return frontmatter;
  }

  const drop = new Set(dropTools || []);
  const seen = new Set();
  const entries = [];
  for (const tool of field.value) {
    if (drop.has(tool)) {
      continue;
    }
    const replacement = toolMap[tool];
    const names = replacement === undefined ? [tool] : Array.isArray(replacement) ? replacement : [replacement];
    for (const name of names) {
      if (!seen.has(name)) {
        seen.add(name);
        entries.push([name, true]);
      }
    }
  }

  return setBlockMap(frontmatter, "tools", entries);
}

// rules/<name>.instructions.md -> <profile.rules.dir>/<name>.instructions.md, made
// always-on with an applyTo glob (the .github/instructions/ format).
function toInstructionFile(file, profile) {
  let { frontmatter, body } = parse(file.content);
  if (profile.toolMap) {
    body = substituteProse(body, profile.toolMap);
  }
  body = substituteAgentNames(body, profile);
  frontmatter = setScalar(frontmatter, "applyTo", `"${profile.rules.applyTo}"`);
  const base = file.path.slice("rules/".length);
  return { path: `${profile.rules.dir}/${base}`, content: serialize({ frontmatter, body }) };
}

// rules/<name>.instructions.md -> <profile.rules.dir>/<name>.instructions.md as
// PLAIN markdown (frontmatter dropped): opencode injects the whole file as
// instruction text via opencode.json "instructions", so VS Code-only frontmatter
// (applyTo/description) would just be noise. The file is wired in by
// synthesizeConfig's instructions glob.
function toInstructionConfigFile(file, profile) {
  let { body } = parse(file.content);
  if (profile.toolMap) {
    body = substituteProse(body, profile.toolMap);
  }
  body = substituteAgentNames(body, profile);
  const base = file.path.slice("rules/".length);
  return { path: `${profile.rules.dir}/${base}`, content: body.replace(/^\s+/, "") };
}

// --- synthesized files (opencode.json + plugin) ----------------------------

// Files built from collected source data rather than mapped 1:1 from an input.
function synthesizeFiles(files, profile) {
  const out = [];

  if (profile.config) {
    out.push(synthesizeConfig(files, profile));
  }
  if (profile.plugin) {
    out.push({ path: profile.plugin.location, content: profile.plugin.source });
  }

  return out;
}

// Build the root opencode.json: $schema + mcp (transformed from the source
// .mcp.json) + instructions glob. opencode does NOT read .mcp.json, so its server
// definitions are folded in here under the opencode `mcp` schema.
function synthesizeConfig(files, profile) {
  const config = { $schema: profile.config.schema };

  if (profile.config.mcpFrom) {
    const mcpFile = files.find((file) => file.path === profile.config.mcpFrom);
    if (mcpFile) {
      const servers = transformMcpServers(parseJsonFile(mcpFile).mcpServers);
      if (Object.keys(servers).length > 0) {
        config.mcp = servers;
      }
    }
  }

  if (profile.config.instructionsGlob && files.some((file) => isRulesFile(file.path))) {
    config.instructions = [profile.config.instructionsGlob];
  }

  return { path: profile.config.location, content: JSON.stringify(config, null, 2) };
}

// .mcp.json {mcpServers:{name:{command,args,env}|{url,headers}}} -> opencode `mcp`
// {name:{type:"local",command:[cmd,...args],environment,enabled}} or remote.
function transformMcpServers(mcpServers) {
  const out = {};
  for (const [name, server] of Object.entries(mcpServers || {})) {
    if (!server || typeof server !== "object") {
      continue;
    }
    if (typeof server.url === "string" && server.url) {
      const remote = { type: "remote", url: server.url, enabled: true };
      if (server.headers && Object.keys(server.headers).length > 0) {
        remote.headers = mapVarValues(server.headers);
      }
      out[name] = remote;
    } else if (typeof server.command === "string" && server.command) {
      const command = [server.command, ...(Array.isArray(server.args) ? server.args : [])];
      const local = { type: "local", command, enabled: true };
      if (server.env && Object.keys(server.env).length > 0) {
        local.environment = mapVarValues(server.env);
      }
      out[name] = local;
    }
  }
  return out;
}

// Rewrite VS Code-style placeholders in config string values to opencode's
// {env:NAME} interpolation: ${input:NAME}, ${env:NAME}, and bare ${NAME} all
// become {env:NAME}. opencode has no input-prompt placeholder, so a secret that
// VS Code would prompt for is sourced from the environment instead.
function toOpencodeVars(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/\$\{(?:input:|env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g, "{env:$1}");
}

function mapVarValues(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = toOpencodeVars(value);
  }
  return out;
}

// Rewrite VS Code input placeholders to the env-expansion form Claude Code and
// Copilot CLI both understand: ${input:NAME} -> ${NAME:-} (empty default keeps
// host config parseable when NAME is unset). Mirrors toOpencodeVars.
// Function replacer avoids any $-token ambiguity in the replacement string.
function toEnvExpansion(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{input:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name) => "${" + name + ":-}");
}

// Like mapVarValues but accepts a mapper fn instead of always using toOpencodeVars.
// Allows normalizeMcpPlaceholders to reuse the object-walk pattern with toEnvExpansion.
function mapVarValuesWith(obj, fn) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key] = fn(value);
  }
  return out;
}

// Parse .mcp.json, rewrite only env/args/url/headers string values via
// toEnvExpansion, reserialize. command is intentionally NOT rewritten
// (it is an executable path, not a secret value — ${input:…} placeholders
// are not expected there). Returns a fresh { path, content } — input file
// is never mutated.
function normalizeMcpPlaceholders(file) {
  const obj = parseJsonFile(file);
  for (const server of Object.values(obj.mcpServers || {})) {
    if (!server || typeof server !== "object") continue;
    if (server.env) server.env = mapVarValuesWith(server.env, toEnvExpansion);
    if (Array.isArray(server.args)) server.args = server.args.map(toEnvExpansion);
    if (typeof server.url === "string") server.url = toEnvExpansion(server.url);
    if (server.headers) server.headers = mapVarValuesWith(server.headers, toEnvExpansion);
  }
  return { path: file.path, content: JSON.stringify(obj, null, 2) };
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

function substituteAgentNames(body, profile) {
  if (profile.orchestrator && profile.orchestrator.renameTo) {
    const from = profile.orchestrator.agent;
    const to = profile.orchestrator.renameTo;
    return body.replace(new RegExp(escapeRegExp(from), "g"), to);
  }
  return body;
}

module.exports = { transform };
