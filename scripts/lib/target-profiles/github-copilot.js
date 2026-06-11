"use strict";

// Declarative GitHub Copilot target profile (Copilot CLI + Copilot coding agent).
// Unlike claude, this is NOT a .claude-plugin bundle: Copilot loads customization
// from the repo's .github/ tree. Verified formats:
//   - agents  -> .github/agents/<name>.agent.md  (frontmatter `target: github-copilot`)
//     (microsoft/vscode .github/agents/demonstrate.md)
//   - prompts -> .github/prompts/<name>.prompt.md (keeps ${input:...} + `agent:` routing)
//   - rules   -> .github/instructions/<name>.instructions.md (with `applyTo: "**"`)
// Plugin-only artifacts (manifest, hooks, .mcp.json, plugin skills) are dropped:
// Copilot does not consume them.

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

  // Set the environment field on agents; strip VS Code-only / plugin-only keys.
  setAgentFrontmatter: { target: "github-copilot" },
  frontmatter: {
    stripKeys: ["user-invocable", "disable-model-invocation"],
    commandStripKeys: ["target"], // prompt files have no `target` field; keep `agent:` routing
  },

  // read/search/edit/execute are valid github-copilot tool aliases (identity).
  // vscode/askQuestions has no equivalent: drop it from grants, neutralize in prose.
  toolMap: { "vscode/askQuestions": "ask the user" },
  dropTools: ["vscode/askQuestions"],

  // Drop plugin-only artifacts Copilot does not read.
  drop: [".claude-plugin/", "hooks/", "skills/", ".mcp.json"],

  // No model injection: the source omits model and github-copilot has no models.yaml column.
  validate: null,
};
