"use strict";

// Declarative opencode (opencode.ai / SST) target profile. Consumed by
// target-transform.js. Like github-copilot this is NOT a .claude-plugin bundle:
// opencode loads customization from the repo's .opencode/ tree plus a root
// opencode.json. Verified formats (https://opencode.ai/docs):
//   - agents  -> .opencode/agents/<name>.md  (frontmatter: description, mode,
//     model, tools MAP, ...; filename is the agent id)
//   - commands-> .opencode/commands/<name>.md (keeps `agent:` routing; args use
//     $ARGUMENTS / positional $1 $2, not named ${input:...})
//   - rules   -> .opencode/instructions/<name>.md, referenced from opencode.json
//     "instructions": ["..."] (always-applied, the opencode analogue of Copilot's
//     applyTo:"**")
//   - skills  -> shipped at repo-relative skills/ (read by each phase agent as a
//     file, exactly as for github-copilot; opencode's native skill discovery is
//     not relied upon since agents reference skills/<phase>/SKILL.md by path)
//   - mcp     -> folded INTO opencode.json "mcp" (opencode does NOT read .mcp.json;
//     its schema is {type:"local"|"remote", command:[...], environment, enabled})
//   - hooks   -> opencode has no shell hooks; the runtime is bridged through a
//     JS plugin at .opencode/plugins/ospec.js (see opencode-plugin.js)

const { PLUGIN_SOURCE } = require("./opencode-plugin.js");

module.exports = {
  id: "opencode",
  layout: "dot-opencode",

  orchestrator: {
    agent: "sdd-orchestrator",
    renameTo: "ospec-workflow",
  },

  // Path remapping per category. Source dir -> output dir; extension collapses to .md.
  agentFile: { from: ".agent.md", to: ".md" },
  agentDir: ".opencode/agents",
  commandFile: { from: ".prompt.md", to: ".md" },
  commandDir: ".opencode/commands",

  // rules/*.instructions.md -> standalone files under .opencode/instructions/,
  // wired in via opencode.json "instructions" glob (always applied). NOT inlined
  // into an agent and NOT given a VS Code-style applyTo.
  rules: { strategy: "to-instructions-config", dir: ".opencode/instructions" },

  // Synthesize the root opencode.json: $schema + mcp (transformed from .mcp.json)
  // + instructions glob. This file does not exist in source; it is built from the
  // collected source data after the per-file pass.
  config: {
    location: "opencode.json",
    schema: "https://opencode.ai/config.json",
    mcpFrom: ".mcp.json",
    instructionsGlob: ".opencode/instructions/*.md",
  },

  // The plugin shim that replaces hooks.json (opencode has no shell hooks).
  plugin: { location: ".opencode/plugins/ospec.js", source: PLUGIN_SOURCE },

  // Agents declare tools as a MAP (tool -> bool), not an array; mode is derived
  // from user-invocable (primary entry vs. subagent worker).
  toolsAsMap: true,
  agentMode: { primary: "primary", subagent: "subagent" },

  // Abstract source tools -> opencode built-in tool names. read/grep/glob/edit/
  // write/bash/task/question are all real opencode tools.
  toolMap: {
    read: "read",
    search: ["grep", "glob"],
    edit: ["edit", "write"],
    execute: "bash",
    agent: "task",
    "vscode/askQuestions": "question",
  },

  // Strip VS Code/plugin-only keys; mode replaces user-invocable, and the
  // `agents:` delegation allowlist has no opencode equivalent (subagents are
  // reached via the task tool). Commands keep `agent:` (opencode routes on it) and
  // `description:`, but drop `name` (filename is the id) plus the VS Code-only
  // `tools:`/`argument-hint:` (not valid opencode command fields).
  frontmatter: {
    stripKeys: ["target", "user-invocable", "disable-model-invocation", "agents"],
    commandStripKeys: ["target", "name", "tools", "argument-hint"],
  },

  // Named ${input:x} -> positional $1/$2 (opencode has no named args); ${input} -> $ARGUMENTS.
  commandVars: { style: "positional" },

  // Inject provider/model slugs from models.yaml (opencode column).
  model: { format: "provider-slug" },

  // Drop the Claude plugin manifest, the Claude/Copilot hooks.json (replaced by the
  // plugin), and the standalone .mcp.json (consumed into opencode.json).
  drop: [".claude-plugin/", "hooks/hooks.json", ".mcp.json"],

  // argv form, spawned with shell:false (see github-copilot profile).
  validate: ["node", "scripts/configure/validate-opencode.js", "{out}"],
};
