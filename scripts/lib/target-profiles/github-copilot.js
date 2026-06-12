"use strict";

// Declarative GitHub Copilot target profile (Copilot CLI + Copilot coding agent).
// Unlike claude, this is NOT a .claude-plugin bundle: Copilot loads customization
// from the repo's .github/ tree. Verified formats:
//   - agents  -> .github/agents/<name>.agent.md  (frontmatter `target: github-copilot`)
//     (microsoft/vscode .github/agents/demonstrate.md)
//   - prompts -> .github/prompts/<name>.prompt.md (keeps ${input:...} + `agent:` routing)
//   - rules   -> .github/instructions/<name>.instructions.md (with `applyTo: "**"`)
//   - skills  -> shipped at repo-relative skills/ (NOT auto-loaded by Copilot, but
//     every phase agent's "Skills to load before work" section reads them as files,
//     so the tree must be present or those references dangle).
// Only the Claude plugin manifest (.claude-plugin/) is dropped: Copilot loads
// customization from .github/, .mcp.json, and skills/ read on demand.

module.exports = {
  id: "github-copilot",
  layout: "dot-github",

  // Path remapping per category. Source dir -> output dir; extension preserved.
  agentFile: { from: ".agent.md", to: ".agent.md" },
  agentDir: ".github/agents",
  commandFile: { from: ".prompt.md", to: ".prompt.md" },
  commandDir: ".github/prompts",

  // rules/*.instructions.md become standalone instruction files under .github/instructions/,
  // each made always-on with applyTo: "**". They are NOT inlined into an agent.
  rules: { strategy: "to-instructions", dir: ".github/instructions", applyTo: "**" },

  // Project-level hooks: .github/hooks/hooks.json with Copilot's own schema
  // (version + camelCase events + bash/powershell + timeoutSec). Events without a
  // Copilot equivalent (e.g. PreCompact) are dropped; ${CLAUDE_PLUGIN_ROOT}/ becomes
  // a repo-relative path (project hooks run from the repo root).
  hooks: {
    format: "copilot",
    source: "hooks/hooks.json",
    location: ".github/hooks/hooks.json",
    eventMap: {
      SessionStart: "sessionStart",
      PreToolUse: "preToolUse",
      SubagentStop: "subagentStop",
      Stop: "agentStop",
    },
    stripPathVar: "${CLAUDE_PLUGIN_ROOT}/",
  },

  // MCP is project-level for Copilot CLI: .mcp.json (root) is read as-is (same
  // {mcpServers} schema), so it passes through unchanged.

  // Set the environment field on agents; strip VS Code-only / plugin-only keys.
  setAgentFrontmatter: { target: "github-copilot" },
  frontmatter: {
    stripKeys: ["user-invocable", "disable-model-invocation"],
    commandStripKeys: ["target"], // prompt files have no `target` field; keep `agent:` routing
  },

  // read/search/edit/execute are valid github-copilot tool aliases (identity).
  // vscode/askQuestions maps to Copilot's structured question tool, ask_user.
  toolMap: { "vscode/askQuestions": "ask_user" },

  // Drop only the Claude plugin manifest. .mcp.json and hooks are KEPT (hooks are
  // reshaped to .github/hooks/; MCP passes through), and skills/ ships so agent
  // "Skills to load before work" references resolve.
  drop: [".claude-plugin/"],

  // No model injection: the source omits model and github-copilot has no models.yaml column.
  // argv form (not a shell string): the runner spawns it with shell:false so the
  // {out} path can never be reinterpreted by a shell. "node" resolves to the
  // running interpreter (process.execPath) in the runner.
  validate: ["node", "scripts/configure/validate-github-copilot.js", "{out}"],
};
